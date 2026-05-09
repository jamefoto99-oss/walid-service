"use client";

import { ImageIcon, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { appendRepairJobImage, removeRepairJobImage } from "@/app/actions/repair-jobs";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "../ui/button";

type RepairJobImage = {
  path: string;
  url: string;
};

const maxFileSize = 10 * 1024 * 1024;
const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];

function fileExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension) return extension.replace(/[^a-z0-9]/g, "") || "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/heic") return "heic";
  return "jpg";
}

export function RepairJobImageUploader({
  jobId,
  images,
  canManage,
}: {
  jobId: string;
  images: RepairJobImage[];
  canManage: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || !canManage) return;
    setUploading(true);
    const supabase = createSupabaseBrowserClient();

    try {
      for (const file of Array.from(files)) {
        if (!allowedTypes.includes(file.type)) {
          toast.error(`${file.name} ไม่ใช่ไฟล์รูปภาพที่รองรับ`);
          continue;
        }
        if (file.size > maxFileSize) {
          toast.error(`${file.name} มีขนาดเกิน 10MB`);
          continue;
        }

        const path = `repair-jobs/${jobId}/${crypto.randomUUID()}.${fileExtension(file)}`;
        const { error: uploadError } = await supabase.storage
          .from("repair-job-images")
          .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });

        if (uploadError) {
          toast.error(uploadError.message);
          continue;
        }

        const result = await appendRepairJobImage(jobId, path);
        if (!result.ok) {
          await supabase.storage.from("repair-job-images").remove([path]);
          toast.error(result.error ?? "บันทึก path รูปภาพไม่สำเร็จ");
          continue;
        }
        toast.success(result.message ?? "อัปโหลดรูปแล้ว");
      }
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeImage(path: string) {
    if (!window.confirm("ยืนยันลบรูปรถนี้?")) return;
    startTransition(async () => {
      const result = await removeRepairJobImage(jobId, path);
      if (result.ok) {
        toast.success(result.message ?? "ลบรูปแล้ว");
        router.refresh();
      } else {
        toast.error(result.error ?? "ลบรูปไม่สำเร็จ");
      }
    });
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <div>
            <h2 className="font-semibold">รูปรถก่อนซ่อม / หลักฐานหน้างาน</h2>
            <p className="text-sm text-muted">รองรับ JPG, PNG, WebP, HEIC ขนาดไม่เกิน 10MB ต่อไฟล์</p>
          </div>
        </div>
        {canManage ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              multiple
              className="sr-only"
              onChange={(event) => uploadFiles(event.target.files)}
            />
            <Button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || isPending}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              อัปโหลดรูป
            </Button>
          </div>
        ) : null}
      </div>

      {images.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {images.map((image) => (
            <figure key={image.path} className="group overflow-hidden rounded-md border border-border bg-surface-soft">
              <a href={image.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="รูปรถในงานซ่อม" className="h-full w-full object-cover" />
              </a>
              <figcaption className="flex items-center justify-between gap-2 p-2">
                <span className="truncate text-xs text-muted">{image.path.split("/").pop()}</span>
                {canManage ? (
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-red-50"
                    onClick={() => removeImage(image.path)}
                    disabled={isPending}
                    title="ลบรูป"
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                  </button>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-surface-soft p-8 text-center text-sm text-muted">
          ยังไม่มีรูปรถในงานนี้
        </div>
      )}
    </section>
  );
}
