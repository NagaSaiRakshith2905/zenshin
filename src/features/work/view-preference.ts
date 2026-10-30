"use client";
import { createContext } from "react";
export const DefaultTaskView = createContext<"list" | "board" | "calendar">("board");
