import { useState } from "react";
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
import { Briefcase, Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { toast } from "@/components/ui/use-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function BusinessOfferingsDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["business-offerings"],
    queryFn: () => apiClient.getBusinessOfferings(),
    staleTime: 10000,
  });

  const filtered = (data as any[]).filter((o) => {
    const term = search.toLowerCase();
    const fields = [o.solution, o.product, o.offering_description];
    return fields.some((f) => (f || "").toLowerCase().includes(term));
  });

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

  const handleDelete = async (id: number) => {
    try {
      await apiClient.deleteBusinessOffering(id);
      toast({ title: "Deleted", description: "Business Offering removed" });
      queryClient.invalidateQueries({ queryKey: ["business-offerings"] });
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e?.message || "Failed",
        variant: "destructive",
      });
    }
  };

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
          <CardDescription>Search and browse entries</CardDescription>
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
            <div className="grid gap-3">
              {(filtered as any[]).map((o) => (
                <div
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/business-offerings/${o.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      navigate(`/business-offerings/${o.id}`);
                  }}
                  className="rounded border p-4 hover:shadow cursor-pointer flex items-start justify-between"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {o.product || o.solution || "Offering"}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {o.offering_description || "No description"}
                    </div>
                    <div className="mt-2 flex gap-2">
                      {o.solution && (
                        <Badge variant="secondary">{o.solution}</Badge>
                      )}
                      {o.product && (
                        <Badge variant="outline">{o.product}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="hidden md:flex items-center gap-3">
                    <div className="w-32 bg-gray-200 rounded h-2">
                      <div
                        className={`${(progressMap[o.id] || 0) >= 100 ? "bg-green-500" : (progressMap[o.id] || 0) >= 50 ? "bg-blue-500" : "bg-orange-500"} h-2 rounded`}
                        style={{ width: `${progressMap[o.id] || 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-700 font-medium w-8 text-right">
                      {progressMap[o.id] || 0}%
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(o.id);
                      }}
                      aria-label="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products wise accordion */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>Group by product with counts</CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const groups: Record<string, any[]> = {};
            (filtered as any[]).forEach((o: any) => {
              const key = o.product || "Unknown";
              if (!groups[key]) groups[key] = [];
              groups[key].push(o);
            });
            const keys = Object.keys(groups).sort();
            if (keys.length === 0)
              return <div className="text-gray-600">No entries</div>;
            return (
              <Accordion type="single" collapsible className="w-full">
                {keys.map((k) => {
                  const list = groups[k] || [];
                  return (
                    <AccordionItem key={k} value={k}>
                      <AccordionTrigger>
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{k}</span>
                          <Badge variant="secondary">{list.length}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2">
                          {list.map((o: any) => {
                            const percent = progressMap[o.id] || 0;
                            return (
                              <div
                                key={o.id}
                                className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:shadow-sm"
                                onClick={() =>
                                  navigate(`/business-offerings/${o.id}`)
                                }
                              >
                                <div>
                                  <div className="font-medium text-gray-900">
                                    {o.product || o.solution || "Offering"}
                                  </div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    {o.offering_description || "No description"}
                                  </div>
                                </div>
                                <div className="hidden md:flex items-center gap-2">
                                  <div className="w-32 bg-gray-200 rounded h-2">
                                    <div
                                      className={`${percent >= 100 ? "bg-green-500" : percent >= 50 ? "bg-blue-500" : "bg-orange-500"} h-2 rounded`}
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-700 font-medium w-8 text-right">
                                    {percent}%
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
