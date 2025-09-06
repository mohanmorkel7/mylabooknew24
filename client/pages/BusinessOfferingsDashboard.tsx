import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  Plus,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function BusinessOfferingsDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["business-offerings"],
    queryFn: () => apiClient.getBusinessOfferings(),
    staleTime: 10000,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => apiClient.getClients(),
    staleTime: 30000,
  });

  const filtered = (data as any[]).filter((o) => {
    const term = search.toLowerCase();
    const fields = [o.solution, o.product, o.offering_description];
    return fields.some((f) => (f || "").toLowerCase().includes(term));
  });

  // Helper to get client for an offering
  const getClientForOffering = (offering: any) => {
    return (clients as any[]).find((c) => c.id === offering.client_id) || null;
  };

  const stats = { total: (data as any[]).length };

  // Fetch steps for offerings to compute progress (lightweight, capped by React Query cache)
  const stepQueries = useQueries({
    queries: (data as any[]).map((o) => ({
      queryKey: ["business-offering-steps", o.id],
      queryFn: () => apiClient.getBusinessOfferingSteps(o.id),
      enabled: (data as any[]).length <= 50,
      staleTime: 10000,
    })),
  });

  const progressMap: Record<number, number> = {};
  (data as any[]).forEach((o, idx) => {
    const q = stepQueries[idx];
    const steps = (q?.data as any[]) || [];
    if (!steps.length) return;
    let totalCompletedProbability = 0;
    let totalStepProbability = 0;
    steps.forEach((s: any) => {
      const prob = parseFloat(s.probability_percent) || 0;
      totalStepProbability += prob;
      if (s.status === "completed") totalCompletedProbability += prob;
    });
    const percent = totalStepProbability
      ? Math.min(100, Math.round(totalCompletedProbability))
      : (() => {
          const completed = steps.filter(
            (s: any) => s.status === "completed",
          ).length;
          const inProg = steps.filter(
            (s: any) => s.status === "in_progress",
          ).length;
          const total = steps.length;
          return total
            ? Math.round(((completed + inProg * 0.5) / total) * 100)
            : 0;
        })();
    progressMap[o.id] = percent;
  });

  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await apiClient.deleteBusinessOffering(deleteId);
      toast({ title: "Deleted", description: "Business Offering removed" });
      queryClient.invalidateQueries({ queryKey: ["business-offerings"] });
      setDeleteId(null);
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e?.message || "Failed",
        variant: "destructive",
      });
    }
  };

  // Load all follow-ups and filter for business offerings
  const { data: allFollowUps = [], isLoading: followUpsLoading } = useQuery({
    queryKey: ["follow-ups-dashboard"],
    queryFn: async () => {
      try {
        return await apiClient.getAllFollowUps({});
      } catch {
        return [];
      }
    },
    staleTime: 30000,
  });

  const boFollowUps = (allFollowUps as any[]).filter(
    (f) => f.business_offering_id != null,
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-blue-600" /> Business Offerings
          </h1>
          <p className="text-gray-600 mt-1">
            Manage business offerings and pipeline
          </p>
        </div>
        <Button onClick={() => navigate("/business-offerings/create")}>
          <Plus className="w-4 h-4 mr-2" /> Create Sales
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Total Offerings</CardTitle>
            <CardDescription>All captured business offerings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Domestic</CardTitle>
            <CardDescription>India-based clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>International</CardTitle>
            <CardDescription>Non-India clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">0</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Offerings</CardTitle>
          <CardDescription>
            Search your offerings (see product-wise list below)
          </CardDescription>
          <div className="flex gap-3 items-end w-full">
            <div className="flex-1">
              <Label className="text-sm">Search</Label>
              <Input
                placeholder="Search by client, product or solution"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-gray-600">Loading...</div>
          ) : error ? (
            <div className="text-red-600">Failed to load</div>
          ) : (filtered || []).length === 0 ? (
            <div className="text-gray-600">No Business Offerings found.</div>
          ) : (
            <div className="text-gray-500 text-sm">
              Use the Products accordion below to browse.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Follow-up Status Cards for Business Offerings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {(() => {
          const now = new Date();
          const currentDueFollowUps = (boFollowUps || []).filter(
            (followUp: any) => {
              if (followUp.status === "completed") return false;
              const dueDate = followUp.due_date
                ? new Date(followUp.due_date)
                : new Date(
                    new Date(followUp.created_at).getTime() +
                      3 * 24 * 60 * 60 * 1000,
                  );
              if (isNaN(dueDate.getTime())) return false;
              const timeDiff = dueDate.getTime() - now.getTime();
              const diffDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
              return diffDays >= 0 && diffDays <= 7;
            },
          );

          const overdueFollowUps = (boFollowUps || []).filter(
            (followUp: any) => {
              if (followUp.status === "completed") return false;
              const dueDate = followUp.due_date
                ? new Date(followUp.due_date)
                : new Date(
                    new Date(followUp.created_at).getTime() +
                      3 * 24 * 60 * 60 * 1000,
                  );
              if (isNaN(dueDate.getTime())) return false;
              return dueDate < now;
            },
          );

          return (
            <>
              <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold text-blue-900 flex items-center">
                        <Clock className="w-5 h-5 mr-2" /> Follow-ups Due
                      </CardTitle>
                      <CardDescription className="text-blue-700">
                        Follow-ups due within the next 7 days (
                        {currentDueFollowUps.length} items)
                      </CardDescription>
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-blue-200 text-blue-800"
                    >
                      {currentDueFollowUps.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {followUpsLoading ? (
                    <div className="p-6 text-center text-gray-500">
                      Loading follow-ups...
                    </div>
                  ) : currentDueFollowUps.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="w-6 h-6 text-blue-500" />
                      </div>
                      <p className="text-gray-600 font-medium">
                        All caught up!
                      </p>
                      <p className="text-gray-500 text-sm">
                        No follow-ups due in the next 7 days
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[calc(100vh-400px)] min-h-[200px] overflow-y-auto">
                      {currentDueFollowUps.map(
                        (followUp: any, index: number) => {
                          const dueDate = followUp.due_date
                            ? new Date(followUp.due_date)
                            : new Date(
                                new Date(followUp.created_at).getTime() +
                                  3 * 24 * 60 * 60 * 1000,
                              );
                          const diffDays = Math.ceil(
                            (dueDate.getTime() - now.getTime()) /
                              (1000 * 60 * 60 * 24),
                          );
                          const isToday = diffDays === 0;
                          const isTomorrow = diffDays === 1;
                          return (
                            <div
                              key={followUp.id}
                              className={`p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${index === currentDueFollowUps.length - 1 ? "border-b-0" : ""}`}
                              onClick={() =>
                                navigate(`/follow-ups?id=${followUp.id}`)
                              }
                              title={
                                followUp.description ||
                                followUp.title ||
                                "No description available"
                              }
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <h4 className="font-medium text-gray-900 text-sm line-clamp-1">
                                      {followUp.title}
                                    </h4>
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${isToday ? "border-orange-300 text-orange-700 bg-orange-50" : isTomorrow ? "border-yellow-300 text-yellow-700 bg-yellow-50" : "border-blue-300 text-blue-700 bg-blue-50"}`}
                                    >
                                      {isToday
                                        ? "Today"
                                        : isTomorrow
                                          ? "Tomorrow"
                                          : `${diffDays} days`}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                                    <span>
                                      Offering:{" "}
                                      {followUp.business_offering_product ||
                                        followUp.business_offering_solution ||
                                        "Unknown"}
                                    </span>
                                    <span>
                                      Step:{" "}
                                      {followUp.business_offering_step_name ||
                                        "N/A"}
                                    </span>
                                    <span>
                                      Assigned to:{" "}
                                      {followUp.assigned_user_name ||
                                        "Unassigned"}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right text-xs text-gray-500">
                                  Due:{" "}
                                  {followUp.due_date
                                    ? (() => {
                                        const utcDate = new Date(
                                          followUp.due_date,
                                        );
                                        const y = utcDate.getFullYear();
                                        const m = String(
                                          utcDate.getMonth() + 1,
                                        ).padStart(2, "0");
                                        const d = String(
                                          utcDate.getDate(),
                                        ).padStart(2, "0");
                                        return `${y}-${m}-${d}`;
                                      })()
                                    : "No date"}
                                </div>
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-red-50 to-red-100 border-b border-red-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold text-red-900 flex items-center">
                        <XCircle className="w-5 h-5 mr-2" /> Overdue Follow-ups
                      </CardTitle>
                      <CardDescription className="text-red-700">
                        Follow-ups that are past their due date (
                        {overdueFollowUps.length} items)
                      </CardDescription>
                    </div>
                    <Badge
                      variant="destructive"
                      className="bg-red-200 text-red-800"
                    >
                      {overdueFollowUps.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {followUpsLoading ? (
                    <div className="p-6 text-center text-gray-500">
                      Loading follow-ups...
                    </div>
                  ) : overdueFollowUps.length === 0 ? (
                    <div className="p-6 text-center">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="w-6 h-6 text-green-500" />
                      </div>
                      <p className="text-gray-600 font-medium">Great job!</p>
                      <p className="text-gray-500 text-sm">
                        No overdue follow-ups
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[calc(100vh-400px)] min-h-[200px] overflow-y-auto">
                      {overdueFollowUps.map((followUp: any) => (
                        <div
                          key={followUp.id}
                          className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() =>
                            navigate(`/follow-ups?id=${followUp.id}`)
                          }
                          title={
                            followUp.description ||
                            followUp.title ||
                            "No description available"
                          }
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <h4 className="font-medium text-gray-900 text-sm line-clamp-1">
                                  {followUp.title}
                                </h4>
                              </div>
                              <div className="flex items-center space-x-4 text-xs text-gray-500">
                                <span>
                                  Offering:{" "}
                                  {followUp.business_offering_product ||
                                    followUp.business_offering_solution ||
                                    "Unknown"}
                                </span>
                                <span>
                                  Step:{" "}
                                  {followUp.business_offering_step_name ||
                                    "N/A"}
                                </span>
                                <span>
                                  Assigned to:{" "}
                                  {followUp.assigned_user_name || "Unassigned"}
                                </span>
                              </div>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              Due:{" "}
                              {followUp.due_date
                                ? (() => {
                                    const utcDate = new Date(followUp.due_date);
                                    const y = utcDate.getFullYear();
                                    const m = String(
                                      utcDate.getMonth() + 1,
                                    ).padStart(2, "0");
                                    const d = String(
                                      utcDate.getDate(),
                                    ).padStart(2, "0");
                                    return `${y}-${m}-${d}`;
                                  })()
                                : "No date"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          );
        })()}
      </div>


      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Business Offering?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All related steps and comments will
              be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
