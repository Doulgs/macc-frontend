"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Preferences = {
  theme: "light" | "dark";
  collapsed: boolean;
  companies: Record<string, string>;
  setTheme: (theme: "light" | "dark") => void;
  toggleCollapsed: () => void;
  chooseCompany: (accountId: string, companyId: string) => void;
};
export const usePreferences = create<Preferences>()(persist((set) => ({
  theme: "light",
  collapsed: false,
  companies: {},
  setTheme: (theme) => set({ theme }),
  toggleCollapsed: () => set(state => ({ collapsed: !state.collapsed })),
  chooseCompany: (accountId, companyId) => set(state => ({ companies: { ...state.companies, [accountId]: companyId } })),
}), { name: "macc-interface", skipHydration: true }));
