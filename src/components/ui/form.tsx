"use client"

import * as React from "react"
import { Field } from "@base-ui/react/field"
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
  useFormState,
} from "react-hook-form"

import { cn } from "cn"

const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const { getFieldState } = useFormContext()
  const formState = useFormState({ name: fieldContext.name })
  const fieldState = getFieldState(fieldContext.name, formState)

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }

  return {
    name: fieldContext.name,
    ...fieldState,
  }
}

function FormItem({
  className,
  ...props
}: React.ComponentProps<typeof Field.Root>) {
  const { error } = useFormField()

  return (
    <Field.Root
      data-slot="form-item"
      invalid={!!error}
      className={cn("grid gap-2", className)}
      {...props}
    />
  )
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof Field.Label>) {
  return (
    <Field.Label
      data-slot="form-label"
      className={cn("data-[invalid]:text-destructive", className)}
      {...props}
    />
  )
}

// Base UI's field controls (Input, Select, Checkbox, ...) wire themselves
// (id, aria-describedby, aria-invalid, disabled) to the nearest Field.Root
// automatically, so FormControl doesn't need to be a Slot wrapper — it just
// passes children through.
const FormControl = React.Fragment

function FormDescription({
  className,
  ...props
}: React.ComponentProps<typeof Field.Description>) {
  return (
    <Field.Description
      data-slot="form-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function FormMessage({
  className,
  ...props
}: React.ComponentProps<typeof Field.Error>) {
  const { error } = useFormField()
  const body = error ? String(error?.message ?? "") : props.children

  if (!body) {
    return null
  }

  return (
    <Field.Error
      data-slot="form-message"
      match={true}
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {body}
    </Field.Error>
  )
}

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}
