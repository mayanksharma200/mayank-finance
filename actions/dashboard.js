"use server";

import aj from "@/lib/arcjet";
import { db } from "@/lib/prisma";
import { request } from "@arcjet/next";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

// ✅ Helper Function - Serialize Transactions Safely
const serializeTransaction = (obj) => {
  if (!obj) return null;

  return {
    ...obj,
    balance: obj.balance ? obj.balance.toNumber() : 0,
    amount: obj.amount ? obj.amount.toNumber() : 0,
  };
};

// ✅ Get User Accounts - Prevents Crashes if User is Missing
export async function getUserAccounts() {
  try {
    const { userId } = await auth();
    if (!userId) return [];

    await db.$connect(); // Ensure DB connection

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) return [];

    const accounts = await db.account.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { transactions: true } } },
    });

    return Array.isArray(accounts) ? accounts.map(serializeTransaction) : [];
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return [];
  } finally {
    await db.$disconnect(); // Close DB connection
  }
}

// ✅ Create Account - Handles Invalid Data and Rate Limits
export async function createAccount(data) {
  try {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    await db.$connect(); // Ensure DB connection

    const req = await request();
    const decision = await aj.protect(req, { userId, requested: 1 });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        console.error("Rate limit exceeded:", decision.reason);
        return { success: false, error: "Too many requests. Try again later." };
      }
      return { success: false, error: "Request blocked" };
    }

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) return { success: false, error: "User not found" };

    // ✅ Convert Balance to Float Safely
    const balanceFloat = parseFloat(data.balance);
    if (isNaN(balanceFloat) || balanceFloat < 0) {
      return { success: false, error: "Invalid balance amount" };
    }

    // ✅ Check Existing Accounts
    const existingAccounts = await db.account.findMany({
      where: { userId: user.id },
    });
    const shouldBeDefault =
      existingAccounts.length === 0 ? true : data.isDefault;

    // ✅ Update Default Account if Needed
    if (shouldBeDefault) {
      await db.account.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    // ✅ Create New Account
    const account = await db.account.create({
      data: {
        ...data,
        balance: balanceFloat,
        userId: user.id,
        isDefault: shouldBeDefault,
      },
    });

    revalidatePath("/dashboard");
    return { success: true, data: serializeTransaction(account) };
  } catch (error) {
    console.error("Error creating account:", error);
    return { success: false, error: "Failed to create account" };
  } finally {
    await db.$disconnect(); // Close DB connection
  }
}

// ✅ Get Dashboard Data - Prevents Crashes if User is Missing
export async function getDashboardData() {
  try {
    const { userId } = await auth();
    if (!userId) return [];

    await db.$connect(); // Ensure DB connection

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) return [];

    // ✅ Fetch Transactions
    const transactions = await db.transaction.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
    });

    return Array.isArray(transactions)
      ? transactions.map(serializeTransaction)
      : [];
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return [];
  } finally {
    await db.$disconnect(); // Close DB connection
  }
}
