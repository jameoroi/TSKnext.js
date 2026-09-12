'use client';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ECharts } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';
use([BarChart,GridComponent,TooltipComponent,CanvasRenderer]);
export function MetricChart({metrics,title='Metrics'}:{metrics:Record<string,unknown>;title?:string}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{if(!ref.current)return;const rows=Object.entries(metrics||{}).filter(([,v])=>typeof v==='number').slice(0,12);if(!rows.length)return;const chart:ECharts=init(ref.current);chart.setOption({tooltip:{trigger:'axis'},grid:{left:48,right:20,top:20,bottom:70},xAxis:{type:'category',data:rows.map(([k])=>k),axisLabel:{rotate:32}},yAxis:{type:'value'},series:[{type:'bar',data:rows.map(([,v])=>v)}]});const resize=()=>chart.resize();window.addEventListener('resize',resize);return()=>{window.removeEventListener('resize',resize);chart.dispose()}},[metrics]);return <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-bold">{title}</h2><div ref={ref} className="mt-3 h-80 w-full"/></section>}
