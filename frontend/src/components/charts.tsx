import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from "recharts";
const grid = "#292a32",
  muted = "#878995";
const tooltip = {
  background: "#23242c",
  border: "1px solid #3a3b46",
  borderRadius: 8,
  color: "#ececf1",
  fontSize: 12,
};
export function TrendChart({
  data,
  dataKey = "value",
  color = "#ae9aff",
  height = 210,
}: {
  data: Record<string, unknown>[];
  dataKey?: string;
  color?: string;
  height?: number;
}) {
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 15, bottom: 0, left: -20 }}
        >
          <defs>
            <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="name"
            stroke={muted}
            axisLine={false}
            tickLine={false}
            fontSize={10}
            minTickGap={24}
            dy={9}
          />
          <YAxis
            stroke={muted}
            axisLine={false}
            tickLine={false}
            fontSize={10}
          />
          <Tooltip contentStyle={tooltip} />
          <Area
            name={dataKey.replaceAll("_", " ")}
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            fill={`url(#fill-${dataKey})`}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: color }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Bars({
  data,
  dataKey = "value",
  horizontal = false,
  height = 210,
}: {
  data: Record<string, unknown>[];
  dataKey?: string;
  horizontal?: boolean;
  height?: number;
}) {
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{
            top: 12,
            right: 20,
            bottom: 0,
            left: horizontal ? 15 : -20,
          }}
        >
          <CartesianGrid stroke={grid} strokeDasharray="3 5" vertical={false} />
          {horizontal ? (
            <>
              <XAxis type="number" stroke={muted} fontSize={10} />
              <YAxis
                type="category"
                dataKey="name"
                width={135}
                tickLine={false}
                axisLine={false}
                stroke={muted}
                fontSize={10}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="name"
                stroke={muted}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                minTickGap={15}
              />
              <YAxis
                stroke={muted}
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
            </>
          )}
          <Tooltip contentStyle={tooltip} cursor={{ fill: "#ffffff04" }} />
          <Bar
            dataKey={dataKey}
            radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
            maxBarSize={28}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={i % 2 ? "#8274c0" : "#b19cf5"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
