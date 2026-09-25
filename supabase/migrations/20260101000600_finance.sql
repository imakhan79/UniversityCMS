-- ============================================================================
-- MIGRATION 006 — Finance
-- Zicon UMS
--
-- Creates: fee_structures, fee_invoices, payments, scholarships,
-- scholarship_awards (supporting table, needed to link a scholarship to
-- the students who received it), expenses, budgets, payroll, ledger_entries.
-- ============================================================================

create type public.fee_type as enum (
  'tuition', 'hostel', 'transport', 'library', 'exam', 'registration', 'other'
);

create type public.invoice_status as enum (
  'pending', 'partially_paid', 'paid', 'overdue', 'cancelled', 'waived'
);

create type public.payment_method as enum (
  'cash', 'card', 'bank_transfer', 'online', 'cheque', 'scholarship_credit'
);

create type public.payment_status as enum ('pending', 'completed', 'failed', 'refunded');

create type public.scholarship_type as enum ('merit', 'need_based', 'sports', 'staff_dependent', 'other');

create type public.expense_status as enum ('pending', 'approved', 'rejected', 'paid');

create type public.payroll_status as enum ('draft', 'processed', 'paid');

-- ----------------------------------------------------------------------------
-- fee_structures
-- ----------------------------------------------------------------------------

create table public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  semester_id uuid references public.semesters(id) on delete cascade,
  name text not null,
  fee_type public.fee_type not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD',
  is_mandatory boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_fee_structures_university_id on public.fee_structures (university_id);
create index idx_fee_structures_program_id on public.fee_structures (program_id);

alter table public.fee_structures enable row level security;

create policy fee_structures_select on public.fee_structures
  for select using (public.is_member_of_university(university_id));

create policy fee_structures_write on public.fee_structures
  for all using (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id));

select public.attach_standard_triggers('public.fee_structures');

-- ----------------------------------------------------------------------------
-- fee_invoices
-- ----------------------------------------------------------------------------

create table public.fee_invoices (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  semester_id uuid references public.semesters(id),
  fee_structure_id uuid references public.fee_structures(id),
  invoice_number text not null,
  amount_due numeric(12, 2) not null check (amount_due >= 0),
  amount_paid numeric(12, 2) not null default 0,
  due_date date,
  status public.invoice_status not null default 'pending',
  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, invoice_number)
);

create index idx_fee_invoices_university_id on public.fee_invoices (university_id);
create index idx_fee_invoices_student_id on public.fee_invoices (student_id);
create index idx_fee_invoices_status on public.fee_invoices (university_id, status);

alter table public.fee_invoices enable row level security;

create policy fee_invoices_select on public.fee_invoices
  for select using (
    student_id = auth.uid()
    or public.is_guardian_of(student_id)
    or public.has_any_role_in_university(array['admin', 'finance', 'registrar']::public.app_role[], university_id)
  );

create policy fee_invoices_write on public.fee_invoices
  for all using (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id));

select public.attach_standard_triggers('public.fee_invoices');

-- ----------------------------------------------------------------------------
-- payments
-- ----------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  fee_invoice_id uuid not null references public.fee_invoices(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method public.payment_method not null,
  transaction_reference text,
  status public.payment_status not null default 'completed',
  paid_at timestamptz not null default now(),
  received_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_payments_university_id on public.payments (university_id);
create index idx_payments_fee_invoice_id on public.payments (fee_invoice_id);
create index idx_payments_student_id on public.payments (student_id);

alter table public.payments enable row level security;

create policy payments_select on public.payments
  for select using (
    student_id = auth.uid()
    or public.is_guardian_of(student_id)
    or public.has_any_role_in_university(array['admin', 'finance', 'registrar']::public.app_role[], university_id)
  );

create policy payments_write on public.payments
  for all using (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id));

select public.attach_standard_triggers('public.payments');

-- ----------------------------------------------------------------------------
-- scholarships / scholarship_awards
-- ----------------------------------------------------------------------------

create table public.scholarships (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  name text not null,
  description text,
  type public.scholarship_type not null default 'merit',
  amount numeric(12, 2),
  percentage numeric(5, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  check (amount is not null or percentage is not null)
);

create index idx_scholarships_university_id on public.scholarships (university_id);

alter table public.scholarships enable row level security;

create policy scholarships_select on public.scholarships
  for select using (public.is_member_of_university(university_id));

create policy scholarships_write on public.scholarships
  for all using (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id));

select public.attach_standard_triggers('public.scholarships');

create table public.scholarship_awards (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  scholarship_id uuid not null references public.scholarships(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  semester_id uuid references public.semesters(id),
  amount_awarded numeric(12, 2) not null,
  status public.invoice_status not null default 'pending',
  awarded_by uuid references auth.users(id),
  awarded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (scholarship_id, student_id, semester_id)
);

create index idx_scholarship_awards_university_id on public.scholarship_awards (university_id);
create index idx_scholarship_awards_student_id on public.scholarship_awards (student_id);

alter table public.scholarship_awards enable row level security;

create policy scholarship_awards_select on public.scholarship_awards
  for select using (
    student_id = auth.uid()
    or public.is_guardian_of(student_id)
    or public.has_any_role_in_university(array['admin', 'finance', 'registrar']::public.app_role[], university_id)
  );

create policy scholarship_awards_write on public.scholarship_awards
  for all using (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id));

select public.attach_standard_triggers('public.scholarship_awards');

-- ----------------------------------------------------------------------------
-- expenses
-- ----------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  department_id uuid references public.departments(id),
  category text not null,
  description text,
  amount numeric(12, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  status public.expense_status not null default 'pending',
  submitted_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  receipt_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index idx_expenses_university_id on public.expenses (university_id);
create index idx_expenses_department_id on public.expenses (department_id);
create index idx_expenses_status on public.expenses (university_id, status);

alter table public.expenses enable row level security;

create policy expenses_select on public.expenses
  for select using (
    submitted_by = auth.uid()
    or public.has_any_role_in_university(array['admin', 'finance', 'dean', 'hod']::public.app_role[], university_id)
  );

create policy expenses_insert on public.expenses
  for insert with check (public.has_any_role_in_university(array['admin', 'finance', 'dean', 'hod']::public.app_role[], university_id));

create policy expenses_write_finance on public.expenses
  for all using (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id));

select public.attach_standard_triggers('public.expenses');

-- ----------------------------------------------------------------------------
-- budgets
-- ----------------------------------------------------------------------------

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  department_id uuid references public.departments(id),
  fiscal_year text not null,
  category text not null,
  allocated_amount numeric(14, 2) not null default 0,
  spent_amount numeric(14, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (university_id, department_id, fiscal_year, category)
);

create index idx_budgets_university_id on public.budgets (university_id);
create index idx_budgets_department_id on public.budgets (department_id);

alter table public.budgets enable row level security;

create policy budgets_select on public.budgets
  for select using (public.has_any_role_in_university(array['admin', 'finance', 'dean', 'hod']::public.app_role[], university_id));

create policy budgets_write on public.budgets
  for all using (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id));

select public.attach_standard_triggers('public.budgets');

-- ----------------------------------------------------------------------------
-- payroll — employee_id references auth.users(id) here; migration 007 adds
-- a tightening FK once public.employees exists.
-- ----------------------------------------------------------------------------

create table public.payroll (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  employee_id uuid not null references auth.users(id) on delete cascade,
  pay_period_start date not null,
  pay_period_end date not null,
  basic_salary numeric(12, 2) not null,
  allowances jsonb not null default '{}'::jsonb,
  deductions jsonb not null default '{}'::jsonb,
  net_salary numeric(12, 2) not null,
  status public.payroll_status not null default 'draft',
  processed_by uuid references auth.users(id),
  processed_at timestamptz,
  payslip_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (employee_id, pay_period_start, pay_period_end),
  check (pay_period_end > pay_period_start)
);

create index idx_payroll_university_id on public.payroll (university_id);
create index idx_payroll_employee_id on public.payroll (employee_id);

alter table public.payroll enable row level security;

create policy payroll_select on public.payroll
  for select using (
    employee_id = auth.uid()
    or public.has_any_role_in_university(array['admin', 'hr', 'finance']::public.app_role[], university_id)
  );

create policy payroll_write on public.payroll
  for all using (public.has_any_role_in_university(array['admin', 'hr', 'finance']::public.app_role[], university_id))
  with check (public.has_any_role_in_university(array['admin', 'hr', 'finance']::public.app_role[], university_id));

select public.attach_standard_triggers('public.payroll');

-- ----------------------------------------------------------------------------
-- ledger_entries — general ledger (double-entry bookkeeping)
-- ----------------------------------------------------------------------------

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  entry_date date not null default current_date,
  account_code text not null,
  account_name text not null,
  debit numeric(14, 2) not null default 0,
  credit numeric(14, 2) not null default 0,
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  check (debit >= 0 and credit >= 0 and (debit = 0 or credit = 0))
);

create index idx_ledger_entries_university_id on public.ledger_entries (university_id);
create index idx_ledger_entries_entry_date on public.ledger_entries (entry_date);
create index idx_ledger_entries_reference on public.ledger_entries (reference_type, reference_id);

alter table public.ledger_entries enable row level security;

create policy ledger_entries_select on public.ledger_entries
  for select using (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id));

-- Ledger entries are append-only: financial records must not be editable
-- after posting, only reversed with a new offsetting entry.
create policy ledger_entries_insert on public.ledger_entries
  for insert with check (public.has_any_role_in_university(array['admin', 'finance']::public.app_role[], university_id));

select public.attach_standard_triggers('public.ledger_entries');
