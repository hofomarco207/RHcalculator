import { NextResponse } from 'next/server'

const ADMIN_PASSWORD = '0890'

export async function POST(req: Request) {
  const { password } = await req.json() as { password: string }
  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: '密碼錯誤' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set('rh_admin', '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // no maxAge = session cookie (cleared when browser closes)
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('rh_admin')
  return res
}
