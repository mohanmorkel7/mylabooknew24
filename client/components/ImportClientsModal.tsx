import React, { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  Upload,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api";
import * as XLSX from "xlsx";

const TEMPLATE_HEADERS = [
  "Source",
  "Source Value",
  "Client Name",
  "Client Type",
  "Payment Offering",
  "Website",
  "Client Geography",
  "Txn Volume / per day in million",
  "Product Tag Info",
  "Street Address",
  "City",
  "State",
  "Country",
  "Contact Name",
  "Designation",
  "Phone Prefix",
  "Contact Phone",
  "Contact Email",
  "LinkedIn Profile Link",
];

interface ImportClientRow {
  source?: string;
  sourceValue?: string;
  clientName: string;
  clientType?: string;
  paymentOffering?: string;
  website?: string;
  geography?: string;
  txnVolume?: string;
  productTagInfo?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  contacts?: Array<{
    contact_name: string;
    designation?: string;
    phone_prefix?: string;
    phone?: string;
    email?: string;
    linkedin_profile_link?: string;
  }>;
}

interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
}

export function ImportClientsModal({
  open,
  onOpenChange,
  onImportSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess: () => void;
}) {
  const [step, setStep] = useState<"download" | "upload" | "preview">(
    "download",
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ImportClientRow[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const downloadTemplate = () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);

    XLSX.utils.book_append_sheet(workbook, worksheet, "Clients");
    XLSX.writeFile(workbook, "client_import_template.xlsx");
  };

  const parseExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 2) {
          toast({
            title: "Invalid file",
            description: "Excel file must have headers and at least one row",
            variant: "destructive",
          });
          return;
        }

        const headers = jsonData[0] as string[];
        const rows = jsonData.slice(1);

        const importedRows: ImportClientRow[] = [];
        const validationErrors: ValidationError[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as any[];
          if (!row || row.every((cell) => cell === undefined || cell === ""))
            continue;

          const headerMap: Record<string, number> = {};
          headers.forEach((header, idx) => {
            headerMap[header.toLowerCase().trim()] = idx;
          });

          const clientName = row[headerMap["client name"]]?.toString().trim();

          if (!clientName) {
            validationErrors.push({
              rowIndex: i + 2,
              field: "Client Name",
              message: "Client name is required",
            });
            continue;
          }

          const importedRow: ImportClientRow = {
            source: row[headerMap["source"]]?.toString().trim(),
            sourceValue: row[headerMap["source value"]]?.toString().trim(),
            clientName,
            clientType: row[headerMap["client type"]]?.toString().trim(),
            paymentOffering: row[headerMap["payment offering"]]
              ?.toString()
              .trim(),
            website: row[headerMap["website"]]?.toString().trim(),
            geography: row[headerMap["client geography"]]?.toString().trim(),
            txnVolume: row[
              headerMap["txn volume / per day in million"]
            ]
              ?.toString()
              .trim(),
            productTagInfo: row[headerMap["product tag info"]]
              ?.toString()
              .trim(),
            address: row[headerMap["street address"]]?.toString().trim(),
            city: row[headerMap["city"]]?.toString().trim(),
            state: row[headerMap["state"]]?.toString().trim(),
            country: row[headerMap["country"]]?.toString().trim(),
            contacts: [],
          };

          const contactName =
            row[headerMap["contact name"]]?.toString().trim();
          if (contactName) {
            importedRow.contacts = [
              {
                contact_name: contactName,
                designation: row[headerMap["designation"]]?.toString().trim(),
                phone_prefix:
                  row[headerMap["phone prefix"]]?.toString().trim() || "+91",
                phone: row[headerMap["contact phone"]]?.toString().trim(),
                email: row[headerMap["contact email"]]?.toString().trim(),
                linkedin_profile_link: row[
                  headerMap["linkedin profile link"]
                ]
                  ?.toString()
                  .trim(),
              },
            ];
          }

          importedRows.push(importedRow);
        }

        if (validationErrors.length > 0) {
          setErrors(validationErrors);
          toast({
            title: "Validation errors found",
            description: `${validationErrors.length} row(s) have errors`,
            variant: "destructive",
          });
          return;
        }

        setParsedData(importedRows);
        setStep("preview");
      } catch (error) {
        toast({
          title: "Failed to parse file",
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
          variant: "destructive",
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      !file.name.endsWith(".xlsx") &&
      !file.name.endsWith(".xls") &&
      !file.name.endsWith(".csv")
    ) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx, .xls) or CSV",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    parseExcelFile(file);
  };

  const importMutation = useMutation({
    mutationFn: async (clients: ImportClientRow[]) => {
      const results = [];

      for (const client of clients) {
        const payload: any = {
          client_name: client.clientName.trim(),
          address: client.address?.trim() || undefined,
          city: client.city?.trim() || undefined,
          state: client.state?.trim() || undefined,
          country: client.country?.trim() || undefined,
          status: "active",
          notes: JSON.stringify({
            source: client.source || "Bulk Import",
            source_value: client.sourceValue,
            client_type: client.clientType,
            payment_offerings: client.paymentOffering
              ? client.paymentOffering.split(",").map((s) => s.trim())
              : [],
            website: client.website,
            geography: client.geography,
            txn_volume: client.txnVolume,
            product_tag_info: client.productTagInfo,
            contacts: client.contacts || [],
          }),
        };

        const result = await apiClient.request("/clients", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        results.push(result);
      }

      return results;
    },
    onSuccess: (results) => {
      toast({
        title: "Import successful",
        description: `${results.length} client(s) imported successfully`,
      });
      setParsedData([]);
      setErrors([]);
      setSelectedFile(null);
      setStep("download");
      onImportSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description:
          error?.message || "Failed to import clients. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleImport = () => {
    if (parsedData.length === 0) {
      toast({
        title: "No data to import",
        description: "Please upload a file with client data",
        variant: "destructive",
      });
      return;
    }

    importMutation.mutate(parsedData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Clients</DialogTitle>
          <DialogDescription>
            Download the template, add your client data, and upload to import
            multiple clients at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === "download" && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <div className="text-center space-y-4">
                    <div className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-8">
                      <Download className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                      <h3 className="font-semibold text-gray-900 mb-2">
                        Step 1: Download Template
                      </h3>
                      <p className="text-gray-600 mb-4">
                        Start by downloading the Excel template with the correct
                        headers
                      </p>
                      <Button
                        onClick={downloadTemplate}
                        className="gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download Template
                      </Button>
                    </div>

                    <div className="relative py-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-500">
                          Then
                        </span>
                      </div>
                    </div>

                    <div className="bg-green-50 border-2 border-dashed border-green-300 rounded-lg p-8">
                      <Upload className="w-12 h-12 text-green-600 mx-auto mb-4" />
                      <h3 className="font-semibold text-gray-900 mb-2">
                        Step 2: Upload File
                      </h3>
                      <p className="text-gray-600 mb-4">
                        After adding your data, upload the file here
                      </p>
                      <Input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileSelect}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <strong>Template Instructions:</strong>
                    <ul className="mt-2 space-y-1 list-disc list-inside">
                      <li>
                        <strong>Required:</strong> Client Name
                      </li>
                      <li>
                        <strong>Source & Source Value:</strong> Select from:
                        LinkedIn-Outbound, LinkedIn-Inbound, Email-Outbound,
                        Email-Inbound, Call-Outbound, Call-Inbound, Existing
                        Client, Business Team, Reference, General List
                      </li>
                      <li>
                        <strong>Payment Offering:</strong> For multiple values,
                        separate with commas (e.g., "Online Payments, UPI
                        Payments")
                      </li>
                      <li>
                        <strong>Client Geography:</strong> Choose: Domestic or
                        International
                      </li>
                      <li>
                        <strong>Priority:</strong> low, medium, high, or urgent
                        (defaults to medium)
                      </li>
                      <li>
                        <strong>Multiple Contacts:</strong> Create separate rows
                        with the same client name for each contact
                      </li>
                      <li>
                        <strong>Phone Prefix:</strong> Defaults to +91 if not
                        specified
                      </li>
                      <li>All other fields are optional</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              {errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Validation Errors:</strong>
                    <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                      {errors.map((error, idx) => (
                        <div key={idx} className="text-sm">
                          Row {error.rowIndex}: {error.field} -{" "}
                          {error.message}
                        </div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-900">
                    {parsedData.length} client(s) ready to import
                  </p>
                  <p className="text-sm text-green-800">
                    Review the data below before importing
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[150px]">Client Name</TableHead>
                      <TableHead className="w-[120px]">Type</TableHead>
                      <TableHead className="w-[130px]">Geography</TableHead>
                      <TableHead className="w-[120px]">Source</TableHead>
                      <TableHead className="w-[120px]">Country</TableHead>
                      <TableHead className="w-[100px]">Contacts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-sm">
                          {row.clientName}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.clientType || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.geography || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.source || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.country || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-center">
                          {row.contacts?.length || 0}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("download");
                    setParsedData([]);
                    setSelectedFile(null);
                  }}
                >
                  Back
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending}
                >
                  {importMutation.isPending ? "Importing..." : "Submit & Import"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
