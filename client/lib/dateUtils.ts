// Utility functions for handling IST (India Standard Time) formatting

export const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Formats a date to IST timezone with various options
 */
export const formatToIST = (
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {},
): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  };

  return dateObj.toLocaleDateString("en-IN", defaultOptions);
};

/**
 * Formats a date to IST timezone with time included
 */
export const formatToISTDateTime = (
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {},
): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return "Invalid Date";

  const fmt: Intl.DateTimeFormatOptions = {
    timeZone: IST_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...options,
  };

  // Use Intl to format directly in IST to avoid double-offset issues
  const parts = new Intl.DateTimeFormat("en-IN", fmt).formatToParts(dateObj);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = get("dayPeriod");

  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod?.toUpperCase()}`;
};

/**
 * Formats a date to just the date part in IST (YYYY-MM-DD format)
 */
export const formatToISTDateOnly = (date: string | Date): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  // Convert to IST and extract date part
  const istDate = new Date(
    dateObj.toLocaleString("en-US", { timeZone: IST_TIMEZONE }),
  );

  return istDate.toISOString().split("T")[0];
};

/**
 * Gets current IST timestamp as a proper Date object
 */
export const getCurrentISTTimestamp = (): Date => {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const istMs = utcMs + 5.5 * 60 * 60 * 1000; // Add 5.5 hours for IST
  return new Date(istMs);
};

export const getCurrentISTDate = (): string => {
  const now = new Date();
  const istDate = new Date(
    now.toLocaleString("en-US", { timeZone: IST_TIMEZONE }),
  );
  return istDate.toISOString().split("T")[0];
};

export const getCurrentISTDateTime = (): string => {
  return formatToISTDateTime(getCurrentISTTimestamp());
};

export const formatToUTCDateTime = (
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {},
): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return "Invalid Date";
  const fmt: Intl.DateTimeFormatOptions = {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...options,
  };
  const parts = new Intl.DateTimeFormat("en-IN", fmt).formatToParts(dateObj);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = get("dayPeriod");
  return `${day} ${month} ${year}, ${hour}:${minute} ${dayPeriod?.toUpperCase()}`;
};

/**
 * Checks if a date is overdue (past current IST time)
 */
export const isOverdue = (dueDate: string | Date): boolean => {
  const dueDateObj = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const currentIST = getCurrentISTTimestamp();

  // Use epoch milliseconds for accurate comparison
  return dueDateObj.getTime() < currentIST.getTime();
};

/**
 * Gets relative time in IST (e.g., "2 hours ago", "in 3 days")
 */
export const getRelativeTimeIST = (date: string | Date): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const currentIST = getCurrentISTTimestamp();

  // Convert the event time to IST as well to compare in the same timezone
  const eventIST = convertToIST(dateObj);

  const diffMs = currentIST.getTime() - eventIST.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60)
    return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

  return formatToIST(eventIST);
};

/**
 * Converts any date to IST timezone and returns as Date object
 */
export const convertToIST = (date: string | Date): Date => {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  // Convert to IST by adding 5.5 hours directly to UTC time
  // dateObj.getTime() already returns UTC milliseconds, no need for getTimezoneOffset
  const istMs = dateObj.getTime() + 5.5 * 60 * 60 * 1000; // Add 5.5 hours for IST (+05:30)
  return new Date(istMs);
};

/**
 * Formats date for API queries (YYYY-MM-DD in IST)
 */
export const formatDateForAPI = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const istDate = convertToIST(dateObj);
  return istDate.toISOString().split("T")[0];
};
