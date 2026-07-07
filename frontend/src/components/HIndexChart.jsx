import { Line } from 'react-chartjs-2';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

/**
 * @param {{label: string, hIndex: number}[]} history - past H-index snapshots
 * @param {{month: number, hIndex: number}[]} [projection] - optional future projection path
 */
export default function HIndexChart({ history = [], projection = [] }) {
  const { t } = useTranslation();
  const historyLabels = history.map((h) => h.label);
  const projectionLabels = projection.map((p) => `+${p.month}mo`);
  const labels = [...historyLabels, ...projectionLabels];

  const historyData = history.map((h) => h.hIndex);
  const projectionData = [
    ...new Array(Math.max(historyLabels.length - 1, 0)).fill(null),
    ...(historyLabels.length > 0 ? [historyData[historyData.length - 1]] : []),
    ...projection.slice(1).map((p) => p.hIndex),
  ];

  const data = {
    labels,
    datasets: [
      {
        label: t('chart.historyLabel'),
        data: [...historyData, ...new Array(projectionLabels.length).fill(null)],
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124,58,237,0.12)',
        fill: true,
        tension: 0.35,
        pointRadius: 3,
      },
      ...(projection.length > 0
        ? [
            {
              label: t('chart.projectionLabel'),
              data: projectionData,
              borderColor: '#0ea5e9',
              backgroundColor: 'rgba(14,165,233,0.08)',
              borderDash: [6, 4],
              fill: true,
              tension: 0.35,
              pointRadius: 2,
            },
          ]
        : []),
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  };

  return (
    <div style={{ height: 320 }}>
      <Line data={data} options={options} />
    </div>
  );
}
