import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Activity,
  Download,
  FileText,
  Calendar,
  User,
  Clock,
  CheckCircle,
  AlertTriangle,
  PlayCircle,
  Filter,
  Building2,
  Target,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  format,
  parseISO,
  isAfter,
  isBefore,
  startOfDay,
  endOfDay,
} from "date-fns";
import {
  formatToISTDateTime,
  getRelativeTimeIST,
  convertToIST,
  formatDateForAPI,
  getCurrentISTDate,
} from "@/lib/dateUtils";

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  action:
    | "task_created"
    | "task_updated"
    | "subtask_status_changed"
    | "task_assigned"
    | "sla_alert"
    | "delay_reported";
  entity_type: "task" | "subtask";
  entity_id: string;
  entity_name: string;
  client_name?: string;
  user_name: string;
  details: string;
  changes?: any;
  status?: string;
  previous_status?: string;
  delay_reason?: string;
}

export default function FinOpsActivityLog() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    entity_type: "all",
    action: "all",
    days: 7,
    search: "",
    date_filter: getCurrentISTDate(), // Default to today in IST
  });
  const [currentTime, setCurrentTime] = useState(new Date());

  // Real-time timer for live time updates
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Don't render if user is not available
  if (!user) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-600">Loading...</span>
      </div>
    );
  }

  // Fetch activity logs
  const {
    data: activityData,
    isLoading,
    refetch,
    error: queryError,
    isError,
  } = useQuery({
    queryKey: ["activity-logs", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.entity_type !== "all")
        params.append("entity_type", filters.entity_type);
      if (filters.action !== "all") params.append("action", filters.action);
      params.append("limit", "50");

      // Use IST date for filtering
      if (filters.date_filter) {
        // Convert selected date to IST and use for filtering
        const selectedDate = new Date(filters.date_filter);
        const startOfDayIST = formatDateForAPI(startOfDay(selectedDate));
        const endOfDayIST = formatDateForAPI(endOfDay(selectedDate));
        params.append("start_date", startOfDayIST);
        params.append("end_date", endOfDayIST);
      } else {
        // Fallback to days filter
        const startDate = new Date(
          Date.now() - filters.days * 24 * 60 * 60 * 1000,
        );
        params.append("start_date", formatDateForAPI(startDate));
      }

      const url = `/activity-production?${params.toString()}`;
      console.log("Activity API request URL (IST):", url);

      try {
        return await apiClient.request(url);
      } catch (error) {
        console.error("Activity API request failed:", error);
        console.error("Error details:", {
          message: error instanceof Error ? error.message : String(error),
          url,
          filters,
        });

        // Return empty data structure on error
        return {
          activity_logs: [],
          pagination: { total: 0, limit: 50, offset: 0, has_more: false },
        };
      }
    },
    refetchInterval: 30000, // Auto-refetch every 30 seconds
    retry: 1, // Only retry once
    retryDelay: 3000, // Wait 3 seconds before retry
  });

  const activityLogs = activityData?.activity_logs || [];
  const activityError = isError ? queryError : null;

  // Filter logs based on search term
  const filteredLogs = activityLogs.filter((log: ActivityLogEntry) => {
    if (!filters.search) return true;
    const searchTerm = filters.search.toLowerCase();
    return (
      log.entity_name?.toLowerCase().includes(searchTerm) ||
      log.client_name?.toLowerCase().includes(searchTerm) ||
      log.user_name?.toLowerCase().includes(searchTerm) ||
      log.details?.toLowerCase().includes(searchTerm)
    );
  });

  const getActionIcon = (action: string) => {
    switch (action) {
      case "task_created":
        return Target;
      case "task_updated":
        return FileText;
      case "subtask_status_changed":
        return CheckCircle;
      case "task_assigned":
        return User;
      case "sla_alert":
        return AlertTriangle;
      case "delay_reported":
        return Clock;
      default:
        return Activity;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "task_created":
        return "text-green-600 bg-green-100";
      case "task_updated":
        return "text-blue-600 bg-blue-100";
      case "subtask_status_changed":
        return "text-purple-600 bg-purple-100";
      case "task_assigned":
        return "text-indigo-600 bg-indigo-100";
      case "sla_alert":
        return "text-red-600 bg-red-100";
      case "delay_reported":
        return "text-yellow-600 bg-yellow-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "delayed":
        return "bg-yellow-100 text-yellow-800";
      case "overdue":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const exportActivityLog = () => {
    const csvContent = [
      [
        "Timestamp (IST)",
        "Action",
        "Entity Type",
        "Entity Name",
        "User",
        "Client",
        "Details",
      ],
      ...filteredLogs.map((log: ActivityLogEntry) => [
        formatToISTDateTime(log.timestamp, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        log.action,
        log.entity_type,
        log.entity_name,
        log.user_name,
        log.client_name || "",
        log.details,
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finops-activity-log-ist-${formatDateForAPI(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            FinOps Activity Log
          </h2>
          <p className="text-gray-600 mt-1">
            Track all FinOps task activities and status changes
          </p>
        </div>
        <Button
          onClick={exportActivityLog}
          variant="outline"
          disabled={filteredLogs.length === 0}
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Database Status Alert */}
      {activityError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Database Connection Issue:</strong> Unable to load activity
            logs. Please ensure the database connection is working properly.
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Entity Type Filter */}
            <div>
              <Label htmlFor="entity_type">Entity Type</Label>
              <Select
                value={filters.entity_type}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, entity_type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="task">Tasks</SelectItem>
                  <SelectItem value="subtask">Subtasks</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action Filter */}
            <div>
              <Label htmlFor="action">Action</Label>
              <Select
                value={filters.action}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, action: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="task_created">Task Created</SelectItem>
                  <SelectItem value="task_updated">Task Updated</SelectItem>
                  <SelectItem value="subtask_status_changed">
                    Status Changed
                  </SelectItem>
                  <SelectItem value="task_assigned">Task Assigned</SelectItem>
                  <SelectItem value="sla_alert">SLA Alert</SelectItem>
                  <SelectItem value="delay_reported">Delay Reported</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Filter */}
            <div>
              <Label htmlFor="date_filter">Filter by Date (IST)</Label>
              <div className="flex gap-2">
                <Input
                  id="date_filter"
                  type="date"
                  value={filters.date_filter}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      date_filter: e.target.value,
                    }))
                  }
                  max={getCurrentISTDate()}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      date_filter: getCurrentISTDate(),
                    }))
                  }
                  className="whitespace-nowrap"
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    setFilters((prev) => ({
                      ...prev,
                      date_filter: formatDateForAPI(yesterday),
                    }));
                  }}
                  className="whitespace-nowrap"
                >
                  Yesterday
                </Button>
              </div>
            </div>

            {/* Search Filter */}
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search activities..."
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, search: e.target.value }))
                  }
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Activity Log
              {filters.date_filter && (
                <span className="text-sm font-normal text-gray-600">
                  (
                  {formatToISTDateTime(new Date(filters.date_filter), {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  )
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {filteredLogs.length} activities
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw
                  className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-600">
                Loading activity log...
              </span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Activity Found
              </h3>
              <p className="text-gray-600">
                {activityLogs.length === 0
                  ? "No FinOps activities recorded yet. Activities will appear here when tasks are created, updated, or status changes occur."
                  : "No activities match your current filters."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLogs.map((log: ActivityLogEntry) => {
                const ActionIcon = getActionIcon(log.action);
                const actionColor = getActionColor(log.action);

                return (
                  <div
                    key={log.id}
                    className="flex items-start space-x-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {/* Action Icon */}
                    <div className={`p-2 rounded-full ${actionColor}`}>
                      <ActionIcon className="w-4 h-4" />
                    </div>

                    {/* Activity Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-gray-900">
                              {log.entity_name}
                            </h4>
                            <Badge variant="outline" className="text-xs">
                              {log.entity_type}
                            </Badge>
                            {log.status && (
                              <Badge
                                className={`text-xs ${getStatusColor(log.status)}`}
                              >
                                {log.status}
                              </Badge>
                            )}
                          </div>

                          <p className="text-sm text-gray-600 mb-2">
                            {log.details}
                          </p>

                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              <span>{log.user_name}</span>
                            </div>
                            {log.client_name && (
                              <div className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                <span>{log.client_name}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>
                                {formatToISTDateTime(log.timestamp, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                              </span>
                            </div>
                          </div>

                          {/* Show status transition */}
                          {log.previous_status && log.status && (
                            <div className="mt-2 text-xs text-gray-500">
                              Status:{" "}
                              <span
                                className={`px-1 rounded ${getStatusColor(log.previous_status)}`}
                              >
                                {log.previous_status}
                              </span>{" "}
                              →{" "}
                              <span
                                className={`px-1 rounded ${getStatusColor(log.status)}`}
                              >
                                {log.status}
                              </span>
                            </div>
                          )}

                          {/* Show delay reason */}
                          {log.delay_reason && (
                            <div className="mt-2">
                              <Badge
                                variant="outline"
                                className="text-xs text-yellow-700 bg-yellow-50"
                              >
                                Delay: {log.delay_reason}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
