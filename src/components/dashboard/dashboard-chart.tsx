"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/utils";

export function DashboardChart({ data }: { data: { month: string; income: number; expense: number }[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d8dbd0" />
          <XAxis dataKey="month" stroke="#6f7468" />
          <YAxis stroke="#6f7468" tickFormatter={(value) => `${Number(value) / 1000}k`} />
          <Tooltip formatter={(value) => formatCurrency(value)} />
          <Bar dataKey="income" name="รายรับ" fill="#0f766e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="รายจ่าย" fill="#c07a2b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
