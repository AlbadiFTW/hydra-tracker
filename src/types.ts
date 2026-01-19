export interface WaterEntry {
  id: number;
  amount_ml: number;
  timestamp: string;
  date: string;
}

export interface DailyStats {
  date: string;
  total_ml: number;
  goal_ml: number;
  entries_count: number;
  percentage: number;
}

export interface MonthlyStats {
  month: string;
  year: number;
  days: DailyStats[];
  total_ml: number;
  average_ml: number;
  days_goal_met: number;
  current_streak: number;
  best_streak: number;
}

export interface Settings {
  daily_goal_ml: number;
  reminder_interval_minutes: number;
  reminder_enabled: boolean;
  sound_enabled: boolean;
  start_with_system: boolean;
  theme: string;
}

export type Tab = 'today' | 'analytics' | 'settings';
