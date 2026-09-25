"use client"

import type { FieldValues, Path, UseFormReturn } from "react-hook-form"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export type EntityField<TFieldValues extends FieldValues> =
  | { type: "text" | "number" | "date"; name: Path<TFieldValues>; label: string }
  | { type: "textarea"; name: Path<TFieldValues>; label: string }
  | { type: "switch"; name: Path<TFieldValues>; label: string }
  | {
      type: "select"
      name: Path<TFieldValues>
      label: string
      options: { value: string; label: string }[]
    }

interface EntityFormDialogProps<TFieldValues extends FieldValues> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  form: UseFormReturn<TFieldValues>
  fields: EntityField<TFieldValues>[]
  onSubmit: (values: TFieldValues) => void | Promise<void>
  submitLabel?: string
}

export function EntityFormDialog<TFieldValues extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  form,
  fields,
  onSubmit,
  submitLabel = "Save",
}: EntityFormDialogProps<TFieldValues>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid max-h-[60vh] gap-4 overflow-y-auto py-1"
          >
            {fields.map((f) => (
              <FormField
                key={f.name}
                control={form.control}
                name={f.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{f.label}</FormLabel>
                    <FormControl>
                      {f.type === "textarea" ? (
                        <Textarea {...field} value={field.value ?? ""} />
                      ) : f.type === "switch" ? (
                        <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                      ) : f.type === "select" ? (
                        <Select value={field.value ?? ""} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {f.options.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={f.type}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              f.type === "number" ? e.target.valueAsNumber : e.target.value
                            )
                          }
                        />
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
