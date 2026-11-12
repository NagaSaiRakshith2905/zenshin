import { AlignLeft, Hash, Calendar, SquareCheck, CircleChevronDown, List, Link, Star, Heart, Flag, Tag, Bookmark, Briefcase, Circle, Clock, Cloud, File, Folder, Globe, Lightbulb, MapPin, User, Zap, Target, type LucideIcon } from "lucide-react";
import type { propertyIcons } from "@/lib/contracts/property-icons";

export const propertyIconComponents = { AlignLeft, Hash, Calendar, SquareCheck, CircleChevronDown, List, Link, Star, Heart, Flag, Tag, Bookmark, Briefcase, Circle, Clock, Cloud, File, Folder, Globe, Lightbulb, MapPin, User, Zap, Target } satisfies Record<typeof propertyIcons[number], LucideIcon>;
