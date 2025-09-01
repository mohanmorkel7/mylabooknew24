import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Calendar, DollarSign, Building } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "WIP", label: "WIP" },
  { value: "Closed", label: "Closed" },
  { value: "Dropped", label: "Dropped" },
];

const ROUND_STAGES = [
  { value: "pre_seed", label: "Pre seed" },
  { value: "seed", label: "Seed" },
  { value: "bridge_1", label: "Bridge 1" },
  { value: "bridge_2", label: "Bridge 2" },
  { value: "pre_series_a", label: "Pre Series A" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c", label: "Series C" },
];

const STATUS_MAP: Record<string, string> = {
  WIP: "in-progress",
  Closed: "completed",
  Dropped: "lost",
};

export default function CreateFundRaise() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    vc_investor: "",
    status: "WIP",
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

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      return apiClient.request("/vc", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vcs"] });
      queryClient.invalidateQueries({ queryKey: ["vc-stats"] });
    },
  });

  const handleChange = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.vc_investor) {
      alert("Please select a VC");
      return;
    }
    if (!form.round_stage) {
      alert("Please select Investment Stage");
      return;
    }

    const stageLabel = ROUND_STAGES.find((s) => s.value === form.round_stage)?.label || "Fund Raise";

    const payload: any = {
      investor_name: form.vc_investor,
      status: STATUS_MAP[form.status] || "in-progress",
      round_stage: form.round_stage,
      round_title: `${stageLabel} Fund Raise`,
      round_size: form.total_raise_mn,
      valuation: form.valuation_mn,
      start_date: form.start_date || null,
      targeted_end_date: form.end_date || null,
      notes: form.reason,
      template_id: form.template_id,
      created_by: parseInt(user?.id || "1"),
    };

    try {
      const result = await createMutation.mutateAsync(payload);
      const newId = result?.data?.id || result?.id;
      if (newId) {
        navigate(`/vc/${newId}`);
      } else {
        navigate("/fundraise");
      }
    } catch (e) {
      alert("Failed to create Fund Raise. Please try again.");
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/fundraise")}> 
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Fund Raise
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Create Fund Raise</h1>
            <p className="text-gray-600">Set up a new fund raise entry</p>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          <Plus className="w-4 h-4 mr-2" />
          Create Fund Raise
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fund Raise Details</CardTitle>
          <CardDescription>Fill in the required information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>VC</Label>
              <Select value={form.vc_investor} onValueChange={(v) => handleChange("vc_investor", v)}>
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
              <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Investment Stage</Label>
              <Select value={form.round_stage} onValueChange={(v) => handleChange("round_stage", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Stage" />
                </SelectTrigger>
                <SelectContent>
                  {ROUND_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Start Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input type="date" className="pl-10" value={form.start_date} onChange={(e) => handleChange("start_date", e.target.value)} />
              </div>
            </div>

            <div>
              <Label>End Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input type="date" className="pl-10" value={form.end_date} onChange={(e) => handleChange("end_date", e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Total Fund Raise $ Mn</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input placeholder="e.g. 10" className="pl-10" value={form.total_raise_mn} onChange={(e) => handleChange("total_raise_mn", e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Valuation $ Mn</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input placeholder="e.g. 100" className="pl-10" value={form.valuation_mn} onChange={(e) => handleChange("valuation_mn", e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <Label>Reason</Label>
            <Textarea placeholder="Add details/reason" value={form.reason} onChange={(e) => handleChange("reason", e.target.value)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
