"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StepProps } from "../NannyRegistrationFunnel";

export function StepIntro({ goNext }: StepProps) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="text-center pb-4">
        <CardTitle className="text-2xl font-bold text-slate-800">
          Create your nanny profile
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-8 pb-8">
        <p className="text-center text-slate-600 max-w-md">
          Create your nanny profile to match with families that suit your experience, availability and preferences
        </p>
        <Button
          onClick={goNext}
          className="bg-violet-600 hover:bg-violet-700 text-white px-8 py-2.5 text-base font-medium rounded-lg"
        >
          Start Now
        </Button>
      </CardContent>
    </Card>
  );
}
