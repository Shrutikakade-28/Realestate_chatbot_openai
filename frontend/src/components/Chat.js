import React, { useState, useEffect, useRef } from 'react';
import ChartComponent from './ChartComponent';
import TableComponent from './TableComponent';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const typingDotsStyle = `
  .typing-dots::after {
    content: '';
    animation: dots 1.5s steps(5, end) infinite;
  }
  @keyframes dots {
    0%, 20% { content: '' }
    40% { content: '.' }
    60% { content: '..' }
    80%, 100% { content: '...' }
  }
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = typingDotsStyle;
document.head.appendChild(styleSheet);

export default function Chat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Initial welcome message
    setTyping(true);
    setTimeout(() => {
      setMessages([{
        sender: 'bot',
        content: "👋 Hello! I’m your Real Estate Analysis Assistant.\nWhich area or locations do you want me to analyze?\nfor example try'Analyze Wakad' or enter only name"
      }]);
      setTyping(false);
      scrollToBottom();
    }, 1200);
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userInput = input.trim();
    setInput('');
    setLoading(true);
    setTyping(true);
    scrollToBottom();

    // If there is a pending download prompt from the last bot message,
    // interpret the user's text as a yes/no answer before making an API call.
    let lastBotIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === 'bot' && messages[i].askDownload) { lastBotIndex = i; break; }
    }

    if (lastBotIndex >= 0) {
      const lower = userInput.toLowerCase();
      const yes = ['yes', 'y', 'ya', 'yep'];
      const no = ['no', 'n', 'nope', 'nah'];

      // User replied yes -> generate PDF for that bot message
      if (yes.includes(lower)) {
        // append the user's reply and a quick status bot message
        setMessages(prev => [...prev, { sender: 'user', content: userInput }, { sender: 'bot', content: 'Generating PDF...' }]);
        // Use the original bot message data (from current state)
        const botMsg = messages[lastBotIndex];
        await generatePDF(lastBotIndex, botMsg);
        setTyping(false);
        setLoading(false);
        return;
      }

      // User replied no -> dismiss prompt
      if (no.includes(lower)) {
        setMessages(prev => [...prev, { sender: 'user', content: userInput }, { sender: 'bot', content: 'Okay — I will not generate the PDF.' }]);
        dismissDownloadPrompt(lastBotIndex);
        setTyping(false);
        setLoading(false);
        return;
      }

      // Not a valid yes/no -> ask user to reply correctly
      setMessages(prev => [...prev, { sender: 'user', content: userInput }, { sender: 'bot', content: 'Please reply with yes/y/ya or no/n/nope.' }]);
      setTyping(false);
      setLoading(false);
      return;
    }

    // No pending download prompt -> show the user's message in chat
    setMessages(prev => [...prev, { sender: 'user', content: userInput }]);

    // Build API URL. Support natural phrasings for compare, price growth, and analysis.
    let url = 'http://localhost:8000/api/analyze/';

    // 1) Compare queries: "Compare A and B", "A vs B", "compare A and B demand trends"
    const compareRegex = /(?:^|\b)compare\b\s+(.+?)(?:\s+demand trends)?$/i;
    const vsRegex = /(.+?)\s+(?:vs\.?|versus)\s+(.+)/i;

    let m = userInput.match(compareRegex);
    if (m) {
      let rest = m[1];
      // Normalize separators to commas
      rest = rest.replace(/\s*(?:and|&|,|vs\.?|versus)\s*/gi, ',');
      url += `?compare=${encodeURIComponent(rest)}`;

    } else if ((m = userInput.match(vsRegex))) {
      // e.g. "A vs B"
      const a = m[1].trim();
      const b = m[2].trim();
      const rest = `${a},${b}`;
      url += `?compare=${encodeURIComponent(rest)}`;

    } else {
      // 2) Price growth queries (many phrasings)
      const growthRegex = /(?:show|display)?\s*price\s*growth\s*(?:for)?\s*(.+?)(?:\s*(?:over|in|for)?\s*(?:the )?(?:last|past)?\s*(\d+)\s*years?)?$/i;
      m = userInput.match(growthRegex);
      if (m && m[1]) {
        const area = m[1].trim();
        const years = m[2] ? m[2] : '3';
        url += `?area=${encodeURIComponent(area)}&years=${encodeURIComponent(years)}`;
      } else {
        // 3) Analysis queries: "Give me analysis of X", "Analysis of X", "Analyze X"
        const analysisRegex = /(?:give me\s*)?(?:analysis of|analyse of|analyse|analyze)\s+(.+)$/i;
        m = userInput.match(analysisRegex);
        if (m && m[1]) {
          const area = m[1].trim();
          url += `?area=${encodeURIComponent(area)}`;
        } else {
          // Default: treat entire input as an area name
          url += `?area=${encodeURIComponent(userInput.trim())}`;
        }
      }
    }

    try {
      const res = await fetch(url);
      const data = await res.json();

      // Create bot message
      const botMessage = { sender: 'bot', content: '' };

      if (data.status === 'ok') {
        if (data.summary) botMessage.content += data.summary + '\n';
        if (data.chart) botMessage.chart = data.chart;
        if (data.table) botMessage.table = data.table;
        if (data.compare) botMessage.compare = data.compare;
        if (data.compare_diff) botMessage.compare_diff = data.compare_diff;
        // Offer PDF generation when there's meaningful output
        if (data.summary || data.chart || data.table || data.compare) {
          botMessage.askDownload = true;
        }
      } else {
        botMessage.content = data.message || "Sorry, something went wrong.";
      }

      setMessages(prev => [...prev, botMessage]);
      setTyping(false);
      scrollToBottom();

    } catch (err) {
      setMessages(prev => [...prev, { sender: 'bot', content: "Error: " + err.toString() }]);
      setTyping(false);
      scrollToBottom();
    } finally {
      setLoading(false);
    }
  };

  const renderSummary = (summary) => {
    return summary.split("\n").map((line, idx) => (
      <p key={idx} style={{ marginBottom: '0.5rem', lineHeight: '1.5' }}>{line}</p>
    ));
  };

  // Remove askDownload flag for a message
  const dismissDownloadPrompt = (idx) => {
    setMessages(prev => prev.map((m, i) => i === idx ? { ...m, askDownload: false } : m));
  };

  const generatePDF = async (idx, msg) => {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 40;
      let y = 40;

      // Add title
      doc.setFontSize(16);
      doc.text('Real Estate Analysis Report', margin, y);
      y += 24;

      // Add summary text
      if (msg.content) {
        doc.setFontSize(11);
        const lines = doc.splitTextToSize(msg.content, pageWidth - margin * 2);
        doc.text(lines, margin, y);
        y += lines.length * 14 + 8;
      }

      // Find the rendered message container and capture canvases/tables
      const container = document.querySelector(`[data-msg-index="${idx}"]`);
      if (container) {
        // Capture any canvas elements (charts)
        const canvases = container.querySelectorAll('canvas');
        for (const canvas of canvases) {
          try {
            const imgData = canvas.toDataURL('image/png');
            const ratio = canvas.width / canvas.height || 1;
            const imgHeight = (pageWidth - margin * 2) / ratio;
            if (y + imgHeight > doc.internal.pageSize.getHeight() - margin) {
              doc.addPage();
              y = margin;
            }
            doc.addImage(imgData, 'PNG', margin, y, pageWidth - margin * 2, imgHeight);
            y += imgHeight + 10;
          } catch (e) {
            console.warn('Canvas capture failed', e);
          }
        }

        // Capture any table elements using html2canvas
        const tables = container.querySelectorAll('table');
        for (const table of tables) {
          try {
            const canvas = await html2canvas(table, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const ratio = canvas.width / canvas.height || 1;
            const imgHeight = (pageWidth - margin * 2) / ratio;
            if (y + imgHeight > doc.internal.pageSize.getHeight() - margin) {
              doc.addPage();
              y = margin;
            }
            doc.addImage(imgData, 'PNG', margin, y, pageWidth - margin * 2, imgHeight);
            y += imgHeight + 10;
          } catch (e) {
            console.warn('Table capture failed', e);
          }
        }
      }

      const filename = `real-estate-report-${Date.now()}.pdf`;
      doc.save(filename);

      dismissDownloadPrompt(idx);
    } catch (e) {
      console.error('PDF generation failed', e);
      alert('Failed to generate PDF: ' + (e.message || e));
    }
  };

  const handleDownloadYes = (idx, msg) => {
    generatePDF(idx, msg);
  };

  const handleDownloadNo = (idx) => {
    dismissDownloadPrompt(idx);
  };

  return (
    <div style={{
      width: "95%",
        maxWidth: "1400px",
        height: "86vh",
        margin: '0 auto',
      background: "white",
      borderRadius: "10px",
      padding: "20px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      display: "flex",
      flexDirection: "column"
    }}>
      {/* CHAT WINDOW */}
      <div style={{ flex: 1, overflowY: "auto", paddingRight: "10px", minHeight: '70vh' }}>
{messages.map((msg, idx) => (
  <div
    key={idx}
    data-msg-index={idx}
    style={{
      display: 'flex',
      justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
      marginBottom: '10px',
      width: '100%'
    }}
  >
    <div style={{
      background: msg.sender === 'user' ? '#0d6efd' : '#e9ecef',
      color: msg.sender === 'user' ? 'white' : 'black',
      padding: '10px 15px',
      borderRadius: '15px',
      maxWidth: '70%',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
    }}>
      {/* Display summary title ONLY if this is a real analysis summary */}
      {msg.sender === 'bot' && msg.summary && (
        <div style={{ marginBottom: '8px' }}>
          <strong>Summary:</strong>
          {renderSummary(msg.summary)}
        </div>
      )}

      {/* Render normal text messages without titles */}
      {!msg.summary && msg.content && (
        <div>{renderSummary(msg.content)}</div>
      )}

      {/* Chart */}
      {msg.chart && (
        <div style={{ marginBottom: '8px' }}>
          <strong>Chart:</strong>
          <ChartComponent 
            data={msg.chart.map(r => ({
              year: r.Year ?? r.year,
              price: r.price ?? 0,
              demand: r.demand ?? 0
            }))}
          />
        </div>
      )}

      {/* Table */}
      {msg.table && (
        <div style={{ marginBottom: '8px' }}>
          <strong>Table:</strong>
          <TableComponent rows={msg.table} />
        </div>
      )}

      {/* Compare results */}
      {msg.compare && msg.compare_diff && msg.compare_diff.areas && msg.compare_diff.areas.length === 2 ? (
        (() => {
          const [a1, a2] = msg.compare_diff.areas;
          const left = msg.compare[a1];
          const right = msg.compare[a2];
          return (
            <div style={{ marginBottom: '8px' }}>
              <h5>Compare Results: {a1} vs {a2}</h5>

              {/* Summaries side-by-side */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <h6>{a1}</h6>
                  {left && left.summary && <div>{renderSummary(left.summary)}</div>}
                </div>
                <div style={{ flex: 1 }}>
                  <h6>{a2}</h6>
                  {right && right.summary && <div>{renderSummary(right.summary)}</div>}
                </div>
              </div>

              {/* Charts side-by-side */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <strong>{a1} - Chart</strong>
                  {left && left.chart && (
                    <ChartComponent data={left.chart.map(r => ({ year: r.Year ?? r.year, price: r.price ?? 0, demand: r.demand ?? 0 }))} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <strong>{a2} - Chart</strong>
                  {right && right.chart && (
                    <ChartComponent data={right.chart.map(r => ({ year: r.Year ?? r.year, price: r.price ?? 0, demand: r.demand ?? 0 }))} />
                  )}
                </div>
              </div>

              {/* Tables side-by-side */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <strong>{a1} - Table</strong>
                  {left && left.table && <TableComponent rows={left.table} />}
                </div>
                <div style={{ flex: 1 }}>
                  <strong>{a2} - Table</strong>
                  {right && right.table && <TableComponent rows={right.table} />}
                </div>
              </div>

              {/* Difference summary and charts/tables */}
              {msg.compare_diff.summary && (
                <div style={{ marginBottom: '8px' }}>
                  <strong>Difference Summary:</strong>
                  {renderSummary(msg.compare_diff.summary)}
                </div>
              )}

              {msg.compare_diff.chart && (
                <div style={{ marginBottom: '8px' }}>
                  <strong>Difference Chart (A - B):</strong>
                  <ChartComponent data={msg.compare_diff.chart.map(r => ({ year: r.year ?? r.Year, price: r.price ?? 0, demand: r.demand ?? 0 }))} />
                </div>
              )}

              {msg.compare_diff.table && (
                <div>
                  <strong>Difference Table:</strong>
                  <TableComponent rows={msg.compare_diff.table} />
                </div>
              )}
              {/* Download prompt (for compare responses) */}
              {msg.askDownload && (
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <div style={{ fontStyle: 'italic' }}>Do you want me to generate pdf file of these data?</div>
                  <button className="btn btn-sm btn-primary" onClick={() => handleDownloadYes(idx, msg)}>Yes</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => handleDownloadNo(idx)}>No</button>
                </div>
              )}
            </div>
          );
        })()
      ) : (
        // Fallback: render existing compare object per-area
        msg.compare && Object.keys(msg.compare).map(k => (
          <div key={k} style={{ marginBottom: '8px' }}>
            <h6>{k}</h6>
            {msg.compare[k].error ? (
              <div style={{ color: 'red' }}>{msg.compare[k].error}</div>
            ) : (
              <>
                {msg.compare[k].summary && (
                  <div style={{ marginBottom: '5px' }}>
                    <strong>Summary:</strong>
                    {renderSummary(msg.compare[k].summary)}
                  </div>
                )}
                {msg.compare[k].chart && (
                  <div style={{ marginBottom: '5px' }}>
                    <strong>Chart:</strong>
                    <ChartComponent data={msg.compare[k].chart.map(r => ({
                      year: r.Year ?? r.year,
                      price: r.price ?? 0,
                      demand: r.demand ?? 0
                    }))} />
                  </div>
                )}
                {msg.compare[k].table && (
                  <div>
                    <strong>Table:</strong>
                    <TableComponent rows={msg.compare[k].table} />
                  </div>
                )}
              </>
            )}
          </div>
        ))
      )}

      {/* Generic download prompt for single-area or non-compare messages */}
      {msg.askDownload && !msg.compare && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <div style={{ fontStyle: 'italic' }}>Do you want me to generate pdf file of these data?</div>
          <button className="btn btn-sm btn-primary" onClick={() => handleDownloadYes(idx, msg)}>Yes</button>
          <button className="btn btn-sm btn-secondary" onClick={() => handleDownloadNo(idx)}>No</button>
        </div>
      )}
    </div>
  </div>
))}
        {typing && (
          <div style={{ fontStyle: 'italic', opacity: 0.7 }}>...<span className="typing-dots"></span></div>
        )}
        <div ref={chatEndRef}></div>
      </div>

      {/* INPUT AREA */}
      <div style={{ paddingTop: "10px", background: "white" }}>
        <input
          className="form-control mb-2"
          placeholder="Type a message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") sendMessage(); }}
        />
        <div>
          <button className="btn btn-primary me-2" onClick={sendMessage} disabled={loading}>Send</button>
        </div>
      </div>
    </div>
  );
}
