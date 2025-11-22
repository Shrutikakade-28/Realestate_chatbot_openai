import json
import difflib
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import pandas as pd
from pathlib import Path
from .openai_utils import llm_summary  # <-- import your helper function

BASE = Path(__file__).resolve().parent.parent
SAMPLE_PATH = BASE / 'sample_data' / 'Sample_data.xlsx'

PRICE_COLUMNS = [
    'flat - weighted average rate',
    'office - weighted average rate',
    'others - weighted average rate',
    'shop - weighted average rate'
]

def _load_data(uploaded_file=None):
    """Load Excel file"""
    if uploaded_file:
        df = pd.read_excel(uploaded_file)
    else:
        df = pd.read_excel(SAMPLE_PATH)

    df.rename(columns={
        "final location": "Area",
        "year": "Year",
        "total sold - igr": "Demand"
    }, inplace=True)

    # Normalize area and year columns to avoid mismatches
    if 'Area' in df.columns:
        df['Area'] = df['Area'].astype(str).str.strip()

    if 'Year' in df.columns:
        # try to coerce to int where possible
        df['Year'] = pd.to_numeric(df['Year'], errors='coerce')

    return df


def _ensure_price(df_area):
    """Compute a 'price' column robustly even if some expected columns are missing.
    Returns the dataframe with a 'price' column (may contain NaN).
    """
    df_area = df_area.copy()

    # Preferred price columns defined at module top
    available = [c for c in PRICE_COLUMNS if c in df_area.columns]
    if available:
        try:
            df_area.loc[:, 'price'] = df_area[available].mean(axis=1)
            return df_area
        except Exception:
            # fall through to try alternatives
            pass

    # Fallback: try any numeric column that looks like a price
    numeric_cols = df_area.select_dtypes(include=['number']).columns.tolist()
    # Exclude Year and Demand
    numeric_cols = [c for c in numeric_cols if c not in ('Year', 'Demand')]

    if numeric_cols:
        try:
            df_area.loc[:, 'price'] = df_area[numeric_cols].iloc[:, 0]
            return df_area
        except Exception:
            pass

    # Last resort: create price as NaN column so downstream code doesn't KeyError
    df_area.loc[:, 'price'] = pd.NA
    return df_area


def _find_area_df(df, area_query):
    """Return a dataframe filtered to rows that match the area_query.
    Matching is case-insensitive and uses substring containment so that
    'Wakad' matches 'Wakad Pune' or 'Wakad (Pune)'. Returns an empty
    dataframe if no match is found.
    """
    if 'Area' not in df.columns:
        return df.iloc[0:0]

    q = str(area_query).strip().lower()

    # Work on a cleaned column so matching is more forgiving (remove punctuation)
    working = df.copy()
    working['Area_clean'] = working['Area'].astype(str).str.lower().str.replace(r'[^a-z0-9\s]', '', regex=True).str.strip()

    # direct exact match first (cleaned)
    mask_exact = working['Area_clean'] == q
    if mask_exact.any():
        return working[mask_exact].copy()

    # then contains
    mask_contains = working['Area_clean'].str.contains(q, na=False)
    if mask_contains.any():
        return working[mask_contains].copy()

    # then startswith
    mask_starts = working['Area_clean'].str.startswith(q, na=False)
    if mask_starts.any():
        return working[mask_starts].copy()

    # fuzzy matching: try close matches among unique cleaned area names
    choices = working['Area_clean'].dropna().unique().tolist()
    # use difflib to find close matches (cutoff can be tuned)
    matches = difflib.get_close_matches(q, choices, n=1, cutoff=0.7)
    if matches:
        matched = matches[0]
        return working[working['Area_clean'] == matched].copy()

    # final attempt: pick the best sequence-similarity score if reasonably close
    best = None
    best_score = 0.0
    for choice in choices:
        score = difflib.SequenceMatcher(None, q, choice).ratio()
        if score > best_score:
            best_score = score
            best = choice

    if best_score >= 0.6 and best:
        return working[working['Area_clean'] == best].copy()

    # no match found
    return df.iloc[0:0]

@csrf_exempt
def analyze(request):
    try:
        # Load file
        if request.method == 'POST' and request.FILES.get('file'):
            df = _load_data(request.FILES['file'])
        else:
            df = _load_data()

        q = request.GET.get('area')
        compare = request.GET.get('compare')
        years = request.GET.get('years')

        # ======================================================
        #  COMPARE MULTIPLE AREAS
        # ======================================================
        if compare:
            areas = [a.strip() for a in compare.split(',') if a.strip()]
            result = {}

            for area in areas:
                df_area = _find_area_df(df, area)

                if df_area.empty:
                    result[area] = {'error': 'No data for area'}
                    continue

                # Compute price defensively
                df_area = _ensure_price(df_area)
                # demand may be missing; coerce if present
                if 'Demand' in df_area.columns:
                    df_area.loc[:, 'demand'] = df_area['Demand']
                else:
                    df_area.loc[:, 'demand'] = pd.NA
                df_area = df_area.where(pd.notnull(df_area), None)

                chart = (
                    df_area.groupby('Year')
                    .agg({'price': 'mean', 'demand': 'mean'})
                    .reset_index()
                    .to_dict(orient='records')
                )

                table = df_area.to_dict(orient='records')

                # ✅ Use OpenAI summary
                summary = llm_summary(
                    area=area,
                    stats={
                        "price_history": chart,
                        "full_table": table
                    },
                    mode="analysis"
                )

                result[area] = {
                    'summary': summary,
                    'chart': chart,
                    'table': table
                }

            # If exactly two areas were requested, compute point-wise differences
            compare_diff = None
            if len(areas) == 2 and all(a in result and 'error' not in result[a] for a in areas):
                a1, a2 = areas[0], areas[1]
                c1 = result[a1]['chart'] or []
                c2 = result[a2]['chart'] or []

                # Normalize year keys and build maps
                def to_map(c):
                    m = {}
                    for r in c:
                        # accept Year or year
                        y = r.get('Year') if 'Year' in r else r.get('year')
                        try:
                            y = int(y)
                        except Exception:
                            continue
                        m[y] = {
                            'price': float(r.get('price', 0) or 0),
                            'demand': float(r.get('demand', 0) or 0)
                        }
                    return m

                m1 = to_map(c1)
                m2 = to_map(c2)

                years = sorted(set(list(m1.keys()) + list(m2.keys())))

                diff_chart = []
                diff_table = []
                for y in years:
                    p1 = m1.get(y, {}).get('price', 0)
                    p2 = m2.get(y, {}).get('price', 0)
                    d1 = m1.get(y, {}).get('demand', 0)
                    d2 = m2.get(y, {}).get('demand', 0)
                    pdiff = p1 - p2
                    ddiff = d1 - d2

                    diff_chart.append({'year': y, 'price': pdiff, 'demand': ddiff})
                    diff_table.append({
                        'Year': y,
                        f'price_{a1}': p1,
                        f'price_{a2}': p2,
                        'price_diff': pdiff,
                        f'demand_{a1}': d1,
                        f'demand_{a2}': d2,
                        'demand_diff': ddiff
                    })

                # Use LLM to create a short point-wise comparative summary (falls back if LLM not available)
                compare_summary = llm_summary(
                    area=f"{a1} vs {a2}",
                    stats={
                        'area_a': {'name': a1, 'chart': c1},
                        'area_b': {'name': a2, 'chart': c2},
                        'difference_chart': diff_chart,
                        'difference_table': diff_table
                    },
                    mode='compare'
                )

                compare_diff = {
                    'summary': compare_summary,
                    'chart': diff_chart,
                    'table': diff_table,
                    'areas': [a1, a2]
                }

            return JsonResponse({'status': 'ok', 'compare': result, 'compare_diff': compare_diff})

        # ======================================================
        #  SINGLE AREA ANALYSIS
        # ======================================================
        if q:
            df_area = _find_area_df(df, q)

            if df_area.empty:
                return JsonResponse({
                    'status': 'error',
                    'message': 'No data for area'
                }, status=404)

            # Compute price and demand defensively
            df_area = _ensure_price(df_area)
            if 'Demand' in df_area.columns:
                df_area.loc[:, 'demand'] = df_area['Demand']
            else:
                df_area.loc[:, 'demand'] = pd.NA

            # ==================================================
            #   PRICE GROWTH MODE (years=N)
            # ==================================================
            if years:
                try:
                    n = int(years)
                    max_year = df_area["Year"].max()
                    df_area = df_area[df_area["Year"] >= max_year - n + 1].copy()
                except:
                    pass

                price_chart = [
                    {"year": int(r["Year"]), "price": float(r["price"])}
                    for _, r in df_area.iterrows()
                ]

                table = df_area[["Area", "Year", "price"]].to_dict(orient="records")

                # ✅ OpenAI summary for growth
                summary = llm_summary(
                    area=q,
                    stats={
                        "price_growth_chart": price_chart,
                        "table": table,
                        "years": years
                    },
                    mode="growth"
                )

                return JsonResponse({
                    "status": "ok",
                    "summary": summary,
                    "chart": price_chart,
                    "table": table
                })

            # ==================================================
            #   NORMAL FULL ANALYSIS MODE
            # ==================================================
            df_area = df_area.where(pd.notnull(df_area), None)

            chart = (
                df_area.groupby('Year')
                .agg({'price': 'mean', 'demand': 'mean'})
                .reset_index()
                .to_dict(orient='records')
            )

            table = df_area.to_dict(orient='records')

            summary = llm_summary(
                area=q,
                stats={
                    "price_history": chart,
                    "full_table": table
                },
                mode="analysis"
            )

            return JsonResponse({
                'status': 'ok',
                'summary': summary,
                'chart': chart,
                'table': table
            })

        return JsonResponse({'status': 'ok', 'message': 'Please provide ?area= or ?compare='})

    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=500)


def health(request):
    return JsonResponse({'status': 'ok'})
