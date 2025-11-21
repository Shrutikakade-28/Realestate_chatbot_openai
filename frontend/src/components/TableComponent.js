import React from 'react';

export default function TableComponent({ rows }) {
  if (!rows || rows.length === 0) return <div>No table rows</div>;

  const keys = Object.keys(rows[0]);

  return (
    <div 
      className="table-responsive"
      style={{
        maxHeight: "500px",
        overflowY: "auto",
        borderRadius: "10px",
        boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
        background: "white",
        padding: "10px"
      }}
    >
      <table className="table table-bordered table-striped table-hover" 
        style={{ 
          textAlign: "center", 
          verticalAlign: "middle",
          fontSize: "14px"
        }}
      >
        <thead 
          style={{ 
            backgroundColor: "#007bff", 
            color: "white", 
            position: "sticky", 
            top: 0, 
            zIndex: 10
          }}
        >
          <tr>
            {keys.map((k) => (
              <th 
                key={k} 
                style={{ 
                  fontWeight: "600",
                  padding: "10px",
                  whiteSpace: "nowrap"
                }}
              >
                {k.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {keys.map((k) => (
                <td 
                  key={k}
                  style={{ 
                    padding: "8px", 
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "500px"
                  }}
                >
                  {row[k]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
