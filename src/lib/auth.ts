import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { db } from "@/lib/db"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Demo Login",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null

        let user = await db.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) {
          user = await db.user.create({
            data: {
              email: credentials.email,
              name: credentials.name || credentials.email.split("@")[0],
              displayName: credentials.name || credentials.email.split("@")[0],
              photoURL: null,
              founder: true,
              role: "user",
            },
          })
        }

        return {
          id: user.id,
          email: user.email,
          name: user.displayName || user.name || user.email,
          image: user.photoURL,
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false
      return true
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const dbUser = await db.user.findUnique({
          where: { email: user.email! },
        })
        if (dbUser) {
          token.uid = dbUser.id
          token.balance = dbUser.balance
          token.role = dbUser.role
          token.referralCode = dbUser.referralCode
          token.founder = dbUser.founder
          token.vipLevel = dbUser.vipLevel
          token.streak = dbUser.streak
          token.lastClaimAt = dbUser.lastClaimAt?.toISOString()
          token.totalClaimed = dbUser.totalClaimed
          token.banned = dbUser.banned
          token.displayName = dbUser.displayName
        }
      }
      if (trigger === "update" && session) {
        Object.assign(token, session)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string
        session.user.balance = token.balance as number
        session.user.role = token.role as string
        session.user.referralCode = token.referralCode as string
        session.user.founder = token.founder as boolean
        session.user.vipLevel = token.vipLevel as string
        session.user.streak = token.streak as number
        session.user.lastClaimAt = token.lastClaimAt as string
        session.user.totalClaimed = token.totalClaimed as number
      }
      return session
    },
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
}
