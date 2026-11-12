"use client";
import { createContext, useContext } from "react";

export const WorkspaceTimezone = createContext("UTC");
export const useTimezone = () => useContext(WorkspaceTimezone);
