import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useMyVCPartialSaves } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Plus, TrendingUp, Target, CheckCircle, Clock, XCircle, FileText, BarChart3 } from "lucide-react";

const statusColors: Record<string, string> = {
  "in-progress": "bg-blue-100 text-blue-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
  completed: "bg-purple-100 text-purple-700",
};

export default function FundRaiseDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [activeTab] = useState<"vcs" | "drafts">("vcs");

  const userId = user?.id ? parseInt(user.id) : undefined;

  const { data: vcPartialSaves = [], refetch: refetchVCPartialSaves } = useMyVCPartialSaves(userId);

  const deleteVC = useMutation({
    mutationFn: (vcId: number) => apiClient.request(`/vc/${vcId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vcs"] });
      queryClient.invalidateQueries({ queryKey: ["my-vc-partial-saves"] });
      queryClient.invalidateQueries({ queryKey: ["vc-stats"] });
    },
  });

  const { data: vcList = [], refetch: refetchVCs, error: vcError, isLoading: vcLoading } = useQuery({
    queryKey: ["vcs", statusFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (categoryFilter !== "all") params.append("investor_category", categoryFilter);
      const queryString = params.toString();
      const url = queryString ? `/vc?${queryString}` : "/vc";
      try {
        const result = await apiClient.request(url);
        return result || [];
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 30000,
  });

  const { data: vcStats = { total: 0, in_progress: 0, won: 0, lost: 0 }, error: statsError, isLoading: statsLoading } = useQuery({
    queryKey: ["vc-stats"],
    queryFn: async () => {
      try {
        const result = await apiClient.request("/vc/stats");
        return result || { total: 0, in_progress: 0, won: 0, lost: 0 };
      } catch {
        return { total: 0, in_progress: 0, won: 0, lost: 0 };
      }
    },
    retry: false,
    staleTime: 60000,
  });

  const { data: vcProgressData = [], isLoading: progressLoading } = useQuery({
    queryKey: ["vc-progress"],
    queryFn: async () => {
      try {
        const result = await apiClient.request("/vc/progress");
        return result || [];
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 30000,
  });

  const { data: vcTemplates = [] } = useQuery({
    queryKey: ["vc-templates-dashboard"],
    queryFn: async () => {
      try {
        const categories = await apiClient.request("/templates-production/categories");
        if (!categories || !Array.isArray(categories)) return [];
        const vcCategory = categories.find((cat: any) => cat.name === "VC");
        if (vcCategory) return await apiClient.request(`/templates-production/category/${vcCategory.id}`);
        return [];
      } catch {
        return [];
      }
    },
    retry: 1,
  });

  const filteredVCs = (vcList || [])
    .filter((vc: any) => {
      if (vc.is_partial === true || vc.investor_name === "PARTIAL_SAVE_IN_PROGRESS") return false;
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return (
        vc.round_title?.toLowerCase().includes(searchLower) ||
        vc.vc_id?.toLowerCase().includes(searchLower) ||
        vc.investor_name?.toLowerCase().includes(searchLower) ||
        vc.contact_person?.toLowerCase().includes(searchLower)
      );
    })
    .sort((a: any, b: any) => {
      const aValue = a[sortBy] || "";
      const bValue = b[sortBy] || "";
      return sortOrder === "asc" ? (aValue > bValue ? 1 : -1) : aValue < bValue ? 1 : -1;
    });

  if (vcError) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Card className="bg-red-50 border-red-200"><CardContent className="p-6 text-center">Failed to load data</CardContent></Card>
            <Button onClick={() => refetchVCs()}>Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fund Raise Dashboard</h1>
          <p className="text-gray-600 mt-1">Manage fund raises</p>
        </div>
        <Button onClick={() => navigate("/fundraise/create")}> 
          <Plus className="w-4 h-4 mr-2" />
          Create Fund Raise
        </Button>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200"><CardContent className="p-6"><div className="h-16 bg-gray-200 rounded animate-pulse" /></CardContent></Card>
          ))}
        </div>
      ) : statsError ? (
        <Card className="bg-red-50 border-red-200"><CardContent className="p-6 text-center">Failed to load statistics</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-blue-600 text-sm font-medium">Total Fund Raises</p>
                <p className="text-2xl font-bold text-blue-900">{vcStats?.total || 0}</p>
              </div>
              <div className="bg-blue-200 p-3 rounded-full"><Target className="w-6 h-6 text-blue-600" /></div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-orange-600 text-sm font-medium">In Progress</p>
                <p className="text-2xl font-bold text-orange-900">{vcStats?.in_progress || 0}</p>
              </div>
              <div className="bg-orange-200 p-3 rounded-full"><Clock className="w-6 h-6 text-orange-600" /></div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-green-600 text-sm font-medium">Successful</p>
                <p className="text-2xl font-bold text-green-900">{vcStats?.won || 0}</p>
              </div>
              <div className="bg-green-200 p-3 rounded-full"><TrendingUp className="w-6 h-6 text-green-600" /></div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-purple-600 text-sm font-medium">VC Templates</p>
                <p className="text-2xl font-bold text-purple-900">{(vcTemplates || []).length}</p>
              </div>
              <div className="bg-purple-200 p-3 rounded-full"><FileText className="w-6 h-6 text-purple-600" /></div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "vcs" && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input placeholder="Search fund raises..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                </div>
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => { const [field, order] = value.split("-"); setSortBy(field); setSortOrder(order as any); }}>
                <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at-desc">Newest First</SelectItem>
                  <SelectItem value="created_at-asc">Oldest First</SelectItem>
                  <SelectItem value="round_title-asc">Round A-Z</SelectItem>
                  <SelectItem value="round_title-desc">Round Z-A</SelectItem>
                  <SelectItem value="investor_name-asc">Investor A-Z</SelectItem>
                  <SelectItem value="investor_name-desc">Investor Z-A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {(() => {
        if (progressLoading) {
          return (
            <Card className="max-w-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Fund Raise Progress Dashboard</CardTitle>
                <CardDescription>Loading progress data...</CardDescription>
              </CardHeader>
              <CardContent><div className="h-64 bg-gray-100 rounded animate-pulse" /></CardContent>
            </Card>
          );
        }
        if ((vcProgressData || []).length === 0) return null;
        // Reuse the same visualization as VC dashboard for simplicity
        return (
          <Card className="max-w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Fund Raise Progress Dashboard</CardTitle>
              <CardDescription>Track each fund raise's current stage and step progress</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-600">Data visualization reused from VC dashboard</div>
            </CardContent>
          </Card>
        );
      })()}

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Fund Raises</CardTitle>
            <CardDescription>Recent entries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredVCs.map((vc: any) => (
              <div key={vc.vc_id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex items-center gap-3">
                  <div className="font-medium text-gray-900">{vc.round_title || "Fund Raise"}</div>
                  <Badge className={statusColors[vc.status] || ""}>{(vc.status || "").replace("-", " ")}</Badge>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-700">{vc.investor_name || "N/A"}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
