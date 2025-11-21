import React from 'react';
import Chat from './components/Chat';

export default function App() {
  return (
    <div 
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "#d9f1ff",   // Full light blue background
        paddingTop: "30px",       // some top spacing
        boxSizing: "border-box"
      }}
    >
      <h3 
        style={{
          textAlign: "center",
          fontSize: "32px",
          fontWeight: "bold",
          fontFamily: "Poppins, sans-serif",
          marginBottom: "20px"
        }}
      >
        Real Estate Analysis Chatbot
      </h3>

      {/* Chat Section */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Chat />
      </div>
    </div>
  );
}
