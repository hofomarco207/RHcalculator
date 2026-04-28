'use client'

import { type ReactNode, useRef, useState, useCallback } from 'react'
import type { BracketDetail } from '@/types/scenario'

interface CostTooltipProps {
  children: ReactNode
  content: ReactNode
}

interface TooltipPos {
  x: number
  anchorTop: number
  anchorBottom: number
  above: boolean
}

export function CostTooltip({ children, content }: CostTooltipProps) {
  const [pos, setPos] = useState<TooltipPos | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const handleMouseEnter = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPos({
        x: rect.left + rect.width / 2,
        anchorTop: rect.top,
        anchorBottom: rect.bottom,
        above: rect.top > 200,
      })
    }
  }, [])

  return (
    <div
      ref={ref}
      className="inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <div
          style={{
            position: 'fixed',
            left: pos.x,
            ...(pos.above
              ? { bottom: window.innerHeight - pos.anchorTop + 8 }
              : { top: pos.anchorBottom + 8 }),
            transform: 'translateX(-50%)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          className="w-max max-w-xs"
        >
          <div className="bg-popover border border-border text-popover-foreground rounded-md shadow-lg px-3 py-2 text-xs font-mono whitespace-pre-line">
            {content}
          </div>
          {pos.above ? (
            <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1" />
          ) : (
            <div className="w-2 h-2 bg-popover border-l border-t border-border rotate-45 absolute left-1/2 -translate-x-1/2 -top-1" />
          )}
        </div>
      )}
    </div>
  )
}

// ── Tooltip content builders ──────────────────────────────────────────

export function segATooltip(weight: number, rate: number, total: number) {
  return (
    <>
      <span className="text-blue-400 font-semibold">A段 攬收</span>
      {'\n'}
      {rate.toFixed(2)} HKD/KG × {weight} kg
      {'\n'}
      <span className="text-amber-400">= {total.toFixed(2)} HKD</span>
    </>
  )
}

export function segBTooltip(weight: number, rate: number, total: number) {
  return (
    <>
      <span className="text-blue-400 font-semibold">B段 空運</span>
      {'\n'}
      {rate.toFixed(2)} HKD/KG × {weight} kg
      {'\n'}
      <span className="text-amber-400">= {total.toFixed(2)} HKD</span>
    </>
  )
}

export function segCTooltip(n: number, o: number, r: number, p: number, total: number) {
  return (
    <>
      <span className="text-blue-400 font-semibold">C段 清關</span>
      {'\n'}
      N 固定費: {n.toFixed(4)} HKD
      {'\n'}
      O 按KG費: {o.toFixed(4)} HKD
      {'\n'}
      R 海外倉: {r.toFixed(4)} HKD
      {p > 0 && (
        <>
          {'\n'}
          P 車費: {p.toFixed(4)} HKD
        </>
      )}
      {'\n'}
      <span className="text-amber-400">= {total.toFixed(2)} HKD</span>
    </>
  )
}

export function segDTooltip(
  carriers: { name: string; pct: number; rate_usd: number; subtotal_usd: number }[],
  sumUsd: number,
  usdHkd: number,
  total: number
) {
  return (
    <>
      <span className="text-blue-400 font-semibold">D段 尾程</span>
      {carriers
        .filter((c) => c.pct > 0)
        .map((c) => (
          <span key={c.name}>
            {'\n'}
            {c.name} {(c.pct * 100).toFixed(1)}% × ${c.rate_usd.toFixed(4)} = ${c.subtotal_usd.toFixed(4)}
          </span>
        ))}
      {'\n'}
      ──────────
      {'\n'}
      小計: ${sumUsd.toFixed(4)} × {usdHkd}
      {'\n'}
      <span className="text-amber-400">= {total.toFixed(2)} HKD</span>
    </>
  )
}

// ── Scenario-specific tooltip builders (gateway-level detail) ────────────

export function scenarioSegATooltip(detail: BracketDetail['seg_a'], total: number, mul = 1, cur = 'HKD') {
  const rate = detail.pickup_rate + (detail.include_sorting ? detail.sorting_rate : 0)
  const bubble = detail.bubble_ratio ?? 1.0
  const hasPerKg = rate > 0
  const hasPerPiece = (detail.per_piece_fee ?? 0) > 0
  const sym = detail.per_piece_currency === 'JPY' ? '¥'
    : detail.per_piece_currency === 'USD' ? '$'
    : detail.per_piece_currency === 'RMB' ? '¥'
    : '$'

  return (
    <>
      <span className="text-blue-400 font-semibold">A段 攬收</span>
      {hasPerKg && (
        <>
          {'\n'}
          攬收 {detail.pickup_rate.toFixed(2)} HKD/kg
          {detail.include_sorting && (
            <>
              {'\n'}
              分揀 +{detail.sorting_rate.toFixed(2)} HKD/kg
            </>
          )}
          {'\n'}
          {rate.toFixed(2)} × {detail.weight_kg}kg{bubble !== 1.0 && ` × ${bubble}(拋)`} = {(detail.per_kg_cost_hkd ?? 0).toFixed(2)} HKD
        </>
      )}
      {hasPerPiece && (
        <>
          {'\n'}
          件費 {sym}{detail.per_piece_fee}/件 × 匯率 {(detail.exchange_rate ?? 1).toFixed(4)} = {(detail.per_piece_cost_hkd ?? 0).toFixed(2)} HKD
        </>
      )}
      {'\n'}
      <span className="text-amber-400">= {(total * mul).toFixed(2)} {cur}</span>
    </>
  )
}

export function scenarioSegBTooltip(detail: BracketDetail['seg_b'], total: number, label?: string, mul = 1, cur = 'HKD') {
  return (
    <>
      <span className="text-blue-400 font-semibold">{label ?? 'B段 空運'}</span>
      {detail.gateways.length > 0 ? (
        detail.gateways.map((gw) => (
          <span key={gw.gateway}>
            {'\n'}
            <span className="text-blue-300">{gw.gateway}</span> ({(gw.proportion * 100).toFixed(0)}%) {gw.tier_label}
            {gw.is_median && gw.service_count && gw.service_count >= 2 ? (
              <span className="text-amber-300"> ({gw.service_count}家服務取中位)</span>
            ) : null}
            {'\n'}
            {'  '}運費 {gw.rate_per_kg.toFixed(2)} × {gw.bubble_rate}(泡) × {(gw.freight_cost / (gw.rate_per_kg * gw.bubble_rate || 1)).toFixed(2)}kg = {gw.freight_cost.toFixed(2)}
            {'\n'}
            {'  '}提單 {gw.mawb_fixed_total.toFixed(0)} ÷ {Math.round(gw.tickets_per_mawb)}票 = {gw.mawb_amortized.toFixed(2)}
            {'\n'}
            {'  '}小計 {gw.subtotal.toFixed(2)} HKD
          </span>
        ))
      ) : (
        <span>{'\n'}簡易費率</span>
      )}
      {'\n'}
      <span className="text-amber-400">= {(total * mul).toFixed(2)} {cur}</span>
    </>
  )
}

export function scenarioSegCTooltip(detail: BracketDetail['seg_c'], total: number, mul = 1, cur = 'HKD') {
  return (
    <>
      <span className="text-blue-400 font-semibold">C段 清關</span>
      {detail.gateways.length > 0 ? (
        detail.gateways.map((gw) => (
          <span key={gw.gateway}>
            {'\n'}
            <span className="text-blue-300">{gw.gateway}</span> ({(gw.proportion * 100).toFixed(0)}%)
            {'\n'}
            {'  '}MAWB攤分: {gw.mawb_amortized.toFixed(2)} HKD
            {'\n'}
            {'  '}按KG費: {gw.per_kg_cost.toFixed(2)} HKD
            {'\n'}
            {'  '}每票費: {gw.per_hawb_cost.toFixed(2)} HKD
            {'\n'}
            {'  '}小計 {gw.subtotal.toFixed(2)} HKD
          </span>
        ))
      ) : (
        <span>{'\n'}無分口岸明細</span>
      )}
      {'\n'}
      <span className="text-amber-400">= {(total * mul).toFixed(2)} {cur}</span>
    </>
  )
}

export function scenarioSegBCTooltip(detail: BracketDetail['seg_bc'], total: number, mul = 1, cur = 'HKD') {
  if (!detail) return <><span className="text-teal-400 font-semibold">BC 空運+清關</span>{'\n'}<span className="text-amber-400">= {(total * mul).toFixed(2)} {cur}</span></>
  const fuelPct = detail.fuel_surcharge_pct ?? 0
  const rateLabel = `${detail.rate_per_kg} ${detail.currency}/kg × ${detail.weight_kg.toFixed(2)} kg`
  const fuelLabel = fuelPct > 0 ? `× (1 + ${fuelPct}% 燃油)` : ''
  return (
    <>
      <span className="text-teal-400 font-semibold">BC 空運+清關</span>
      {'\n'}
      {rateLabel}
      {fuelLabel && <>{'\n'}{fuelLabel}</>}
      {'\n'}
      = {detail.cost_in_currency.toFixed(2)} {detail.currency}
      {detail.exchange_rate_to_hkd !== 1 && (
        <>
          {'\n'}
          × {detail.exchange_rate_to_hkd.toFixed(4)} (→HKD)
        </>
      )}
      {'\n'}
      <span className="text-amber-400">= {(total * mul).toFixed(2)} {cur}</span>
    </>
  )
}

export function scenarioSegDTooltip(detail: BracketDetail['seg_d'], total: number, mul = 1, cur = 'HKD') {
  const pd = detail.pricing_detail
  return (
    <>
      <span className="text-blue-400 font-semibold">D段 尾程</span>
      {detail.gateways.length > 0 ? (
        // Zone-based model: show carrier breakdown per gateway
        detail.gateways.map((gw) => (
          <span key={gw.gateway}>
            {'\n'}
            <span className="text-blue-300">{gw.gateway}</span> ({(gw.proportion * 100).toFixed(0)}%) {gw.weight_oz.toFixed(1)} oz
            {gw.carriers.filter((c) => c.pct > 0).map((c) => {
              const effective = c.effective_pct ?? c.pct
              const reallocated = Math.abs(effective - c.pct) > 0.001
              return (
                <span key={c.carrier}>
                  {'\n'}
                  {'  '}{c.carrier} {(c.pct * 100).toFixed(0)}%
                  {reallocated && (
                    <span className="text-amber-300"> → {(effective * 100).toFixed(0)}%{c.cost_usd === 0 ? ' (不提供)' : ' (補配)'}</span>
                  )}
                  {' × $'}{c.cost_usd.toFixed(4)}
                </span>
              )
            })}
            {'\n'}
            {'  '}加權 ${gw.avg_cost_usd.toFixed(4)} × {gw.usd_hkd} = {gw.subtotal.toFixed(2)} HKD
          </span>
        ))
      ) : pd?.model === 'weight_bracket' && pd.zones ? (
        // Weight-bracket model
        pd.zones.map((z, i) => (
          <span key={z.zone ?? i}>
            {'\n'}
            {z.zone && <><span className="text-blue-300">{z.zone}</span>{z.weight != null && <span className="text-gray-400"> ({(z.weight * 100).toFixed(1)}%)</span>}{'\n'}</>}
            {'  '}匹配段 ≤{z.matched_bracket_max}kg → {z.bracket_price?.toFixed(2)} {z.currency}
            {(z.additional_units ?? 0) > 0 && (
              <>
                {'\n'}
                {'  '}+ 續重 {z.additional_units} × {z.additional_weight_price?.toFixed(2)} {z.currency}
              </>
            )}
            {'\n'}
            {'  '}= {z.cost_in_currency.toFixed(2)} {z.currency}
            {z.exchange_rate_to_hkd !== 1 && <> × {z.exchange_rate_to_hkd.toFixed(4)}</>}
          </span>
        ))
      ) : pd?.model === 'first_additional' && pd.zones ? (
        // First/additional weight model
        pd.zones.map((z, i) => (
          <span key={z.zone ?? i}>
            {'\n'}
            {z.zone && <><span className="text-blue-300">{z.zone}</span>{z.weight != null && <span className="text-gray-400"> ({(z.weight * 100).toFixed(1)}%)</span>}{'\n'}</>}
            {'  '}首重 {z.first_weight_kg}kg = {z.first_weight_price?.toFixed(2)} {z.currency}
            {(z.additional_units ?? 0) > 0 && (
              <>
                {'\n'}
                {'  '}+ 續重 {z.additional_units} × {z.additional_weight_price?.toFixed(2)} {z.currency}
              </>
            )}
            {'\n'}
            {'  '}= {z.cost_in_currency.toFixed(2)} {z.currency}
            {z.exchange_rate_to_hkd !== 1 && <> × {z.exchange_rate_to_hkd.toFixed(4)}</>}
          </span>
        ))
      ) : pd?.model === 'tiered_per_kg' && pd.tiered ? (
        // Tiered per-kg model (D-5)
        <>
          {'\n'}
          重量段 {pd.tiered.weight_tier}
          {'\n'}
          {pd.tiered.rate_per_kg} {pd.tiered.currency}/kg × {pd.tiered.chargeable_weight} kg
          {pd.tiered.registration_fee > 0 && (
            <>
              {'\n'}
              + 掛號費 {pd.tiered.registration_fee} {pd.tiered.currency}
            </>
          )}
          {'\n'}
          = {pd.tiered.cost_in_currency.toFixed(2)} {pd.tiered.currency}
          {pd.tiered.exchange_rate_to_hkd !== 1 && (
            <>
              {' '}× {pd.tiered.exchange_rate_to_hkd.toFixed(4)} (→HKD)
            </>
          )}
        </>
      ) : pd?.model === 'lookup_table' && pd.lookup ? (
        // Lookup table model (D-6)
        <>
          {'\n'}
          區域 {pd.lookup.area_code}{pd.lookup.area_name ? ` (${pd.lookup.area_name})` : ''}
          {'\n'}
          重量點 {pd.lookup.weight_point} kg → {pd.lookup.amount} {pd.lookup.currency}
          {pd.lookup.exchange_rate_to_hkd !== 1 && (
            <>
              {'\n'}
              × {pd.lookup.exchange_rate_to_hkd.toFixed(4)} (→HKD)
            </>
          )}
        </>
      ) : pd?.model === 'per_piece' ? (
        // Per-piece fixed fee (no weight)
        <>
          {'\n'}
          {pd.per_piece_fee} {pd.currency}/件
          {pd.exchange_rate_to_hkd !== 1 && (
            <>
              {' '}× {pd.exchange_rate_to_hkd?.toFixed(4)} (→HKD)
            </>
          )}
        </>
      ) : pd?.model === 'simple' ? (
        // Simple flat rate
        <>
          {'\n'}
          {pd.rate_per_kg} {pd.currency}/kg × {pd.weight_kg} kg
          {pd.exchange_rate_to_hkd !== 1 && (
            <>
              {'\n'}
              × {pd.exchange_rate_to_hkd?.toFixed(4)} (→HKD)
            </>
          )}
        </>
      ) : (
        <span>{'\n'}無明細</span>
      )}
      {pd && pd.zones && pd.zones.length > 1 && (
        <>
          {'\n'}
          ──────────
          {'\n'}
          {pd.zones.some((z) => z.weight != null) ? '加權合計' : `${pd.zones.length} 區平均`}
        </>
      )}
      {'\n'}
      <span className="text-amber-400">= {(total * mul).toFixed(2)} {cur}</span>
    </>
  )
}
