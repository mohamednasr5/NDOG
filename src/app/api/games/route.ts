import { db } from "@/lib/db"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { userId, gameType } = await req.json()
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    let prize = 0

    if (gameType === "spin_wheel") {
      // Check cooldown - 24 hours
      const lastSpin = await db.wheelSpin.findFirst({
        where: { userId },
        orderBy: { ts: "desc" },
      })
      if (lastSpin) {
        const hoursSince = (Date.now() - lastSpin.ts.getTime()) / (1000 * 60 * 60)
        if (hoursSince < 24) {
          return NextResponse.json({ error: "Cooldown - 24h between spins", hoursRemaining: Math.ceil(24 - hoursSince) }, { status: 429 })
        }
      }

      const prizes = [5, 10, 15, 20, 25, 50, 75, 100]
      prize = prizes[Math.floor(Math.random() * prizes.length)]

      await db.wheelSpin.create({ data: { userId, prize } })
    } else if (gameType === "lucky_box") {
      prize = Math.floor(Math.random() * 96) + 5 // 5-100
      await db.transaction.create({
        data: { userId, type: "lucky_box", amount: prize, description: "Lucky Box prize" },
      })
    } else if (gameType === "scratch_card") {
      prize = Math.floor(Math.random() * 196) + 5 // 5-200
      await db.transaction.create({
        data: { userId, type: "scratch_card", amount: prize, description: "Scratch Card prize" },
      })
    }

    await db.user.update({
      where: { id: userId },
      data: { balance: { increment: prize }, totalClaimed: { increment: prize } },
    })

    return NextResponse.json({ success: true, prize, newBalance: user.balance + prize })
  } catch (error) {
    console.error("Game error:", error)
    return NextResponse.json({ error: "Game failed" }, { status: 500 })
  }
}
