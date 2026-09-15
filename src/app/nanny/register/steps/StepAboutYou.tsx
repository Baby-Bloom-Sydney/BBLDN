"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StepProps, NannyRegistrationData } from "../NannyRegistrationFunnel";
import { uploadFile } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/client";
import { isLiveMode } from "@/components/dev/DevToolbar";

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

export function StepAboutYou({ data, updateData, goNext, goBack }: StepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canContinue = !!data.accuracy_confirmed;

  function handleChange(field: keyof NannyRegistrationData, value: unknown) {
    updateData({ [field]: value } as Partial<NannyRegistrationData>);
  }

  async function handleUpload(file: File) {
    if (isDevMode && !isLiveMode()) {
      updateData({ profile_picture_url: file.name });
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setUploadError("You must be logged in to upload a profile picture.");
      setIsUploading(false);
      return;
    }

    const { url, error } = await uploadFile("profile-pictures", user.id, file);

    if (error) {
      setUploadError(error);
      setIsUploading(false);
      return;
    }

    updateData({ profile_picture_url: url });
    setIsUploading(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }

  function handleDropZoneClick() {
    fileInputRef.current?.click();
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  // Extract display name from URL or filename
  const displayName = data.profile_picture_url
    ? data.profile_picture_url.includes("/")
      ? decodeURIComponent(data.profile_picture_url.split("/").pop()?.replace(/^\d+-/, "") || "Profile picture")
      : data.profile_picture_url
    : null;

  const isUrl = data.profile_picture_url?.startsWith("http");

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center text-slate-800">
          About You
        </CardTitle>
        <p className="text-center text-sm text-slate-500 mt-1">
          Help families see why you&apos;re the perfect fit for their children
        </p>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Hobbies & Interests */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">
            What are some of your hobbies and interests?
          </p>
          <textarea
            rows={4}
            placeholder="Add Hobbies and Interests"
            value={data.hobbies_interests ?? ""}
            onChange={(e) => handleChange("hobbies_interests", e.target.value || null)}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none resize-none"
          />
        </div>

        {/* Strengths & Traits */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">
            What strengths and positive traits make you a great nanny?
          </p>
          <textarea
            rows={4}
            placeholder="Add Strengths and Traits"
            value={data.strengths_traits ?? ""}
            onChange={(e) => handleChange("strengths_traits", e.target.value || null)}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none resize-none"
          />
        </div>

        {/* Specialised Skills & Training */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">
            What specialised skills, experience, or training make you stand out as a nanny?
          </p>
          <textarea
            rows={4}
            placeholder="Add Specialised Skills, Experience and Training"
            value={data.skills_training ?? ""}
            onChange={(e) => handleChange("skills_training", e.target.value || null)}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none resize-none"
          />
        </div>

        {/* Profile Picture Upload */}
        <div className="space-y-3">
          <div
            onClick={handleDropZoneClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-colors"
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-violet-600 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-violet-700">Uploading...</p>
              </div>
            ) : data.profile_picture_url ? (
              <div className="flex flex-col items-center gap-3">
                {isUrl ? (
                  <img
                    src={data.profile_picture_url}
                    alt="Profile preview"
                    className="w-20 h-20 rounded-full object-cover border-2 border-violet-200"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-violet-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-violet-700">
                    {displayName}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Click to change photo</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-center">
                  <svg
                    className="w-10 h-10 text-slate-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <div>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-full border border-violet-400 text-sm font-medium text-violet-700 hover:bg-violet-50 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    Add Profile Picture
                  </button>
                </div>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Parents love seeing who will care for their children. Upload your best profile picture to help them picture you in the role.
                </p>
              </div>
            )}
          </div>
          {uploadError && (
            <p className="text-xs text-red-500">{uploadError}</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Accuracy Confirmation Checkbox */}
        <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <input
            id="accuracy_confirmed"
            type="checkbox"
            checked={!!data.accuracy_confirmed}
            onChange={(e) => handleChange("accuracy_confirmed", e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-violet-600 rounded border-slate-300 cursor-pointer"
          />
          <label
            htmlFor="accuracy_confirmed"
            className="text-sm text-slate-700 cursor-pointer leading-relaxed"
          >
            I confirm that all of the information that I have provided is accurate.
          </label>
        </div>

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={goBack} className="flex-1">
            Back
          </Button>
          {canContinue && (
            <Button
              type="button"
              onClick={goNext}
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
            >
              Continue to add Supporting information
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
