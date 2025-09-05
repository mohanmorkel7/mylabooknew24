import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { VCDraggableStepsList } from "@/components/VCDraggableStepsList";
import { ArrowLeft, Edit } from "lucide-react";

export default function BusinessOfferingsDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const boId = Number(id);

  const {
    data: offering,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["business-offering", boId],
    queryFn: () => apiClient.getBusinessOffering(boId),
    enabled: !!boId,
  });

  const { data: steps = [], refetch: refetchSteps } = useQuery({
    queryKey: ["business-offering-steps", boId],
    queryFn: () => apiClient.getBusinessOfferingSteps(boId),
    enabled: !!boId,
  });

  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const onToggleExpansion = (stepId: number) => {
    setExpandedSteps((prev) => {
      const n = new Set(prev);
      if (n.has(stepId)) n.delete(stepId);
      else n.add(stepId);
      return n;
    });
  };

  const onDeleteStep = async (stepId: number) => {
    await apiClient.deleteBusinessOfferingStep(stepId);
    await refetchSteps();
  };

  const onReorderSteps = async (newItems: any[]) => {
    const orders = newItems.map((s, i) => ({ id: s.id, order: i }));
    await apiClient.reorderBusinessOfferingSteps(boId, orders);
    await refetchSteps();
  };

  const updateStepStatus = async (stepId: number, payload: any) => {
    await apiClient.updateBusinessOfferingStep(stepId, payload);
    await refetchSteps();
  };

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (error || !offering)
    return <div className="p-6 text-red-600">Failed to load</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/business-offerings")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Business Offering
            </h1>
            <p className="text-gray-600">Overview & Steps</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(`/business-offerings/${boId}/edit`)}
        >
          <Edit className="w-4 h-4 mr-2" /> Edit
        </Button>
      </div>

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/business-offerings">
              Business Offerings
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>#{boId}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Key information</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500">Solution</div>
            <div className="font-medium">{offering.solution || "-"}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Product</div>
            <div className="font-medium">{offering.product || "-"}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Client Status</div>
            <div className="font-medium">{offering.client_status || "-"}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Potential MRR (Lacs)</div>
            <div className="font-medium">
              {offering.potential_mrr_lacs ?? "-"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Steps</CardTitle>
          <CardDescription>Track progress</CardDescription>
        </CardHeader>
        <CardContent>
          <VCDraggableStepsList
            vcId={boId}
            steps={steps as any[]}
            expandedSteps={expandedSteps}
            onToggleExpansion={onToggleExpansion}
            onDeleteStep={onDeleteStep}
            onReorderSteps={onReorderSteps}
            updateStepStatus={updateStepStatus}
            stepApiBase={"fund-raises" as any}
          />
        </CardContent>
      </Card>
    </div>
  );
}
