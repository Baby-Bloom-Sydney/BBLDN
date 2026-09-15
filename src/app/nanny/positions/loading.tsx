import { Card, CardContent } from "@/components/ui/card";

export default function NannyPositionsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="grid gap-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="py-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 animate-pulse rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
