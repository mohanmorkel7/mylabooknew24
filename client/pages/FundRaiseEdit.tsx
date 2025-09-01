import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, Calendar, DollarSign, Building } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "Dropped", label: "Dropped" },
  { value: "WIP", label: "WIP" },
  { value: "Closed", label: "Closed" },
];

const ROUND_STAGES = [
  { value: "pre_seed", label: "Pre seed" },
  { value: "seed", label: "Seed" },
  { value: "bridge", label: "Bridge" },
  { value: "pre_series_a", label: "Pre Series A" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c", label: "Series C" },
];

const STATUS_TO_SERVER: Record<string, string> = {
  WIP: "in-progress",
  Closed: "completed",
  Dropped: "lost",
};

const SERVER_TO_STATUS: Record<string, string> = {
  "in-progress": "WIP",
  completed: "Closed",
  lost: "Dropped",
};

const INVESTOR_STATUS_OPTIONS = [
  { value: "Pass", label: "Pass" },
  { value: "WIP", label: "WIP" },
  { value: "Closed", label: "Closed" },
  { value: "Yet to Connect", label: "Yet to Connect" },
  { value: "Future Potential", label: "Future Potential" },
];

export default function FundRaiseEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    vc_investor: "",
    status: "WIP",
    investor_status: "",
    reason: "",
    round_stage: "",
    start_date: "",
    end_date: "",
    total_raise_mn: "",
    valuation_mn: "",
    template_id: 1,
  });

  const { data: vcList = [] } = useQuery({
    queryKey: ["vc-list-all"],
    queryFn: async () => {
      try {
        const result = await apiClient.request("/vc");
        return Array.isArray(result) ? result : [];
      } catch (e) {
        return [];
      }
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const investorOptions = useMemo(() => {
    const names = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    (vcList || []).forEach((vc: any) => {
      const name = vc.investor_name?.trim();
      if (name && !names.has(name)) {
        names.add(name);
        opts.push({ value: name, label: name });
      }
    });
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [vcList]);

  const { data: current, isLoading } = useQuery({
    queryKey: ["fundraise-edit", id],
    queryFn: async () => apiClient.request(`/vc/${id}`),
    enabled: !!id,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  useEffect(() => {
    if (!current) return;
    setForm({
      vc_investor: current.investor_name || "",
      status: SERVER_TO_STATUS[current.status] || "WIP",
      investor_status: current.investor_last_feedback || "",
      reason: current.notes || "",
      round_stage: current.round_stage || "",
      start_date: current.start_date
        ? new Date(current.start_date).toISOString().split("T")[0]
        : "",
      end_date: current.targeted_end_date
        ? new Date(current.targeted_end_date).toISOString().split("T")[0]
        : "",
      total_raise_mn: current.round_size || "",
      valuation_mn: current.valuation || "",
      template_id: current.template_id || 1,
    });
  }, [current]);

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      return apiClient.request(`/vc/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vcs"] });
      queryClient.invalidateQueries({ queryKey: ["vc-stats"] });
      queryClient.invalidateQueries({ queryKey: ["fundraise", id] });
      queryClient.invalidateQueries({ queryKey: ["fundraise-steps", id] });
    },
  });

  const handleChange = (field: string, value: any) =>
    setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async () => {
    const payload: any = {
      investor_name: form.vc_investor,
      status: STATUS_TO_SERVER[form.status] || "in-progress",
      round_stage: form.round_stage,
      round_title: `${ROUND_STAGES.find((s) => s.value === form.round_stage)?.label || "Fund Raise"} Fund Raise`,
      round_size: form.total_raise_mn,
      valuation: form.valuation_mn,
      start_date: form.start_date || null,
      targeted_end_date: form.end_date || null,
      notes: form.reason,
      investor_last_feedback: form.investor_status || null,
      template_id: form.template_id || 1,
      updated_by: parseInt(user?.id || "1"),
    };
    try {
      await updateMutation.mutateAsync(payload);
      navigate(`/fundraise/${id}`);
    } catch (e) {
      // ignore
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center">Loading Fund Raise...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/fundraise/${id}`)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Overview
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Edit Fund Raise
            </h1>
            <p className="text-gray-600">Update fund raise details</p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="fundraise">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="fundraise">Fund Raise</TabsTrigger>
          <TabsTrigger value="queue">Investor Status Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="fundraise" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fund Raise Details</CardTitle>
              <CardDescription>Edit the information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>VC</Label>
                  <Select
                    value={form.vc_investor}
                    onValueChange={(v) => handleChange("vc_investor", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select VC" />
                    </SelectTrigger>
                    <SelectContent>
                      {investorOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <Building className="w-4 h-4" /> {opt.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => handleChange("status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Investor Status</Label>
                  <Select
                    value={form.investor_status}
                    onValueChange={(v) => handleChange("investor_status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Investor Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {INVESTOR_STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Investment Stage</Label>
                  <Select
                    value={form.round_stage}
                    onValueChange={(v) => handleChange("round_stage", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUND_STAGES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Start Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type="date"
                      className="pl-10"
                      value={form.start_date}
                      onChange={(e) =>
                        handleChange("start_date", e.target.value)
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>End Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      type="date"
                      className="pl-10"
                      value={form.end_date}
                      onChange={(e) => handleChange("end_date", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label>Total Fund Raise $ Mn</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="e.g. 10"
                      className="pl-10"
                      value={form.total_raise_mn}
                      onChange={(e) =>
                        handleChange("total_raise_mn", e.target.value)
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>Valuation $ Mn</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="e.g. 100"
                      className="pl-10"
                      value={form.valuation_mn}
                      onChange={(e) =>
                        handleChange("valuation_mn", e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Reason</Label>
                <Textarea
                  placeholder="Add details/reason"
                  value={form.reason}
                  onChange={(e) => handleChange("reason", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <CardTitle>Investor Status Queue</CardTitle>
              <CardDescription>Quickly update status fields</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => handleChange("status", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Investor Status</Label>
                <Select
                  value={form.investor_status}
                  onValueChange={(v) => handleChange("investor_status", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Investor Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {INVESTOR_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
