import json
import logging
from django.conf import settings
from openai import OpenAI

logger = logging.getLogger(__name__)

# -----------------------------
# Initialize OpenAI Client
# -----------------------------
try:
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
except Exception:
    client = None
    logger.warning("Failed to initialize OpenAI client. Check OPENAI_API_KEY.")


# -----------------------------
# Build Prompt
# -----------------------------
def _build_prompt(area, stats, mode="analysis"):
    """
    Build a clean, concise prompt for OpenAI summarization.
    The model will return 4–5 clear sentences.
    """
    return f"""
You are a real-estate expert. Based on the data below, write a clear,
concise 4–5 sentence summary for home buyers and investors.

Rules:
- No bullet points, no tables, no lists.
- Use friendly, professional sentences.
- No invented numbers.
- Only use the given data.
- Explain trends clearly.

Mode: {mode}
Area: {area}

Data:
{json.dumps(stats, indent=2)}
"""


# -----------------------------
# Main LLM Summary Function
# -----------------------------
def llm_summary(area, stats, mode="analysis"):
    """
    Call OpenAI to produce a short summary.
    Returns fallback summary if the API fails.
    """
    prompt = _build_prompt(area, stats, mode=mode)

    # If client failed to initialize
    if client is None:
        logger.warning("OpenAI client not available — using fallback summary.")
        return _fallback_summary(area, stats)

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful real-estate analysis expert."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=200,
            temperature=0.5,
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.warning(f"OpenAI request failed for area={area}: {e}")
        return _fallback_summary(area, stats)


# -----------------------------
# Fallback Summary (Safe)
# -----------------------------
def _fallback_summary(area, stats):
    """
    Generate a simple deterministic summary if OpenAI fails.
    Does NOT show internal errors to the user.
    """
    # Build a deterministic, human-friendly summary from the provided stats.
    try:
        # helper to extract numeric prices from various stats shapes
        prices = []
        years = set()
        demand_vals = []

        def collect_from_record(r):
            if not isinstance(r, dict):
                return
            # accept several possible key names
            for k in ("price", "Price"):
                if k in r:
                    try:
                        prices.append(float(r[k] or 0))
                    except Exception:
                        pass
            for k in ("demand", "Demand"):
                if k in r:
                    try:
                        demand_vals.append(float(r[k] or 0))
                    except Exception:
                        pass
            for k in ("Year", "year"):
                if k in r:
                    try:
                        years.add(int(r[k]))
                    except Exception:
                        pass

        # stats may be list (chart), or dict containing keys like price_history, chart, full_table
        if isinstance(stats, list):
            for rec in stats:
                collect_from_record(rec)
        elif isinstance(stats, dict):
            # look for common containers
            for key in ("price_history", "chart", "price_growth_chart", "full_table", "table"):
                val = stats.get(key)
                if isinstance(val, list):
                    for rec in val:
                        collect_from_record(rec)

            # if nested compare data structures
            if not prices:
                # try to extract charts from nested structures
                for v in stats.values():
                    if isinstance(v, dict) and 'chart' in v and isinstance(v['chart'], list):
                        for rec in v['chart']:
                            collect_from_record(rec)

        # Build summary sentences
        sentences = []

        if prices:
            first = prices[0]
            last = prices[-1]
            try:
                avg = round(sum(prices) / len(prices), 2)
            except Exception:
                avg = None

            # crude trend: compare last vs first if different
            trend = None
            if len(prices) >= 2 and first is not None and last is not None:
                try:
                    pct = ((last - first) / (abs(first) if first else 1)) * 100
                    if pct > 5:
                        trend = f"up about {abs(round(pct,1))}%"
                    elif pct < -5:
                        trend = f"down about {abs(round(pct,1))}%"
                    else:
                        trend = "stable"
                except Exception:
                    trend = None

            s = f"Automated summary (LLM unavailable) for {area}:"
            if avg is not None:
                s += f" average price ≈ {avg}."
            if trend:
                s += f" Recent trend appears {trend}."
            sentences.append(s)

        elif demand_vals:
            try:
                davg = round(sum(demand_vals) / len(demand_vals), 1)
                sentences.append(f"Automated summary for {area}: average demand ≈ {davg}.")
            except Exception:
                sentences.append(f"Automated summary for {area}: data available but could not compute aggregates.")

        else:
            sentences.append(f"Automated summary for {area}: no numeric price or demand data found; showing raw data instead.")

        # Add timeframe if years are collected
        if years:
            yrs = sorted(years)
            if len(yrs) >= 1:
                sentences.append(f"Data covers years {yrs[0]}–{yrs[-1]}.")

        return ' '.join(sentences)

    except Exception:
        return f"Summary unavailable for {area} due to a temporary issue."
