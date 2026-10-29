"use client";
import { createContext } from "react";
export const DefaultTaskView = createContext<"list" | "board">("list");
