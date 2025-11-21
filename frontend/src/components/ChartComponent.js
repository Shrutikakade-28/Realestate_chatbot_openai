import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Legend,
  Tooltip,
  Title
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Legend, Tooltip, Title);

export default function ChartComponent({ data }) {
  if (!data || data.length === 0) return <div>No chart data</div>;

  const labels = data.map(d => d.year);
  const price = data.map(d => d.price);
  const demand = data.map(d => d.demand);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Price',
        data: price,
        borderColor: '#007bff',        // Blue line
        backgroundColor: '#007bff',
        borderWidth: 3,                // Thicker line
        pointRadius: 5,                // Larger circular points
        pointStyle: 'circle',          // circle markers
        tension: 0.3
      },
      {
        label: 'Demand',
        data: demand,
        borderColor: '#28a745',         // Green line
        backgroundColor: '#28a745',
        borderWidth: 2,
        borderDash: [5, 5],             // Dashed line
        pointRadius: 6,                 // Larger square points
        pointStyle: 'rectRot',          // square markers
        tension: 0.4
      }
    ]
  };
  const options = {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          font: { size: 14 }
        }
      },
      title: {
        display: true,
        text: "Price vs Demand Over Years",
        font: { size: 18 }
      }
    },
    scales: {
      x: {
        ticks: { font: { size: 12 } }
      },
      y: {
        ticks: { font: { size: 12 } }
      }
    }
  };
  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <Line data={chartData} options={options} />
    </div>
  );
}
