# Cirrus
> **Autonomous Zero-Trust Cloud Pentesting & Drift Remediation**

Cirrus is a modern, premium cloud security platform that deploys autonomous, context-aware AI agents to perform security audits, identify misconfigurations, and deploy automated, audited remediations on target AWS environments. Designed with a strict zero-trust posture, Cirrus handles runtime AWS credential payloads in-memory, completely avoiding the persistence of access keys in the database.

---

## 🌟 Key Features

* **🔒 Zero-Trust Key Lifecycle**: AWS credentials (Access Key ID, Secret Access Key, Session Token) are requested at runtime, cached locally in client-side `sessionStorage`, and passed over secure SSL headers to short-lived RPC endpoints. They are never saved to a database.
* **🤖 Autonomous Agent Workflows (ReAct Loop)**: Driven by `gemini-3.5-flash` using Vercel AI SDK, agents reason about audit goals, execute read-only API scans, and log thoughts and evidence incrementally.
  * **🔎 Recon Agent**: Discovers caller identities, active regions, and root configurations.
  * **👥 IAM Auditor**: Enters role/user policies, analyzes wildcards, and flags aged keys.
  * **📦 S3 Hunter**: Audits bucket configurations for public block access, public policies, and default encryption.
  * **🖥️ EC2 / Network Agent**: Discovers security groups open to the world (`0.0.0.0/0`) on sensitive ports.
* **🧪 Custom Agent Builder**: Define your own prompts, white-list specific AWS service boundaries (RDS, Lambda, DynamoDB, KMS, CloudTrail), and use safety filters to automatically block mutating instructions.
* **⚡ Real-time Timeline & Regex Search**: Watch agents run live via Supabase WebSockets. Search agent thoughts and tool outputs using exact matching or regular expression pattern filters.
* **🛠️ Automated CloudFormation Playbook Remediation**: For every finding, Gemini generates an explanation, rollback playbook, and safe CloudFormation template. Fixes audit execution steps and automatically polls/logs stack events.
* **🛡️ Capability Validation**: Forces explicit acknowledgment of named IAM resource adjustments (`CAPABILITY_NAMED_IAM`) before applying fixes to safeguard cloud configurations.
* **⏰ Baseline Drift Scheduling**: Define recurring scans to check for drift compared to baseline settings and receive notifications via Resend email integration.

---

## 🏗️ System Architecture

<div align="center">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 620" width="100%" max-width="800" style="background:#0b0f19; border-radius:12px; font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display:block; margin:auto;">
  <!-- Definitions for Arrow Markers and Gradients -->
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/>
    </marker>
    <marker id="arrow-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981"/>
    </marker>
    <marker id="arrow-orange" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ea580c"/>
    </marker>
    <linearGradient id="header-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>

  <!-- Title / Brand Header -->
  <rect x="0" y="0" width="800" height="50" fill="url(#header-grad)" opacity="0.1"/>
  <text x="400" y="32" fill="#ffffff" font-size="16" font-weight="700" text-anchor="middle" letter-spacing="1">CIRRUS PEN-TEST ARCHITECTURE &amp; FLOW</text>

  <!-- Client Browser Panel -->
  <rect x="250" y="80" width="300" height="90" rx="10" fill="#1e1b4b" stroke="#6366f1" stroke-width="2"/>
  <text x="400" y="112" fill="#a5b4fc" font-size="14" font-weight="700" text-anchor="middle">💻 Client SPA (Browser)</text>
  <text x="400" y="132" fill="#cbd5e1" font-size="11" text-anchor="middle">TanStack Start &amp; Router UI</text>
  <text x="400" y="152" fill="#94a3b8" font-size="10" font-weight="600" text-anchor="middle">Real-time Dashboard &amp; Agent Timelines</text>

  <!-- Session Storage (Credentials Cache) -->
  <rect x="30" y="95" width="160" height="60" rx="8" fill="#1c1917" stroke="#ea580c" stroke-width="1.5" stroke-dasharray="4,4"/>
  <text x="110" y="118" fill="#fdba74" font-size="11" font-weight="700" text-anchor="middle">🔒 sessionStorage</text>
  <text x="110" y="135" fill="#cbd5e1" font-size="9" text-anchor="middle">Temporary AWS Keys</text>
  <text x="110" y="146" fill="#f87171" font-size="8" font-weight="700" text-anchor="middle">ZERO DATABASE STORE</text>

  <!-- Server Functions RPC -->
  <rect x="250" y="220" width="300" height="90" rx="10" fill="#0f172a" stroke="#38bdf8" stroke-width="2"/>
  <text x="400" y="248" fill="#7dd3fc" font-size="13" font-weight="700" text-anchor="middle">⚡ Server Functions (TanStack Start)</text>
  <text x="400" y="268" fill="#e2e8f0" font-size="11" text-anchor="middle">Secure RPC Gateway (runScan, replayNode)</text>
  <text x="400" y="288" fill="#94a3b8" font-size="10" text-anchor="middle">Discards AWS key payload upon loop exit</text>

  <!-- Database Tier -->
  <rect x="30" y="235" width="160" height="60" rx="8" fill="#022c22" stroke="#10b981" stroke-width="1.5"/>
  <text x="110" y="258" fill="#6ee7b7" font-size="12" font-weight="700" text-anchor="middle">🗄️ Supabase PG</text>
  <text x="110" y="275" fill="#cbd5e1" font-size="9" text-anchor="middle">Scans, Findings, Steps</text>
  <text x="110" y="286" fill="#10b981" font-size="8" font-weight="600" text-anchor="middle">Realtime WebSocket Channel</text>

  <!-- Gemini Model -->
  <rect x="610" y="235" width="160" height="60" rx="8" fill="#431407" stroke="#ea580c" stroke-width="1.5"/>
  <text x="690" y="258" fill="#ffedd5" font-size="12" font-weight="700" text-anchor="middle">🧠 Google Gemini</text>
  <text x="690" y="275" fill="#fdba74" font-size="10" font-weight="600" text-anchor="middle">gemini-3.5-flash</text>
  <text x="690" y="286" fill="#cbd5e1" font-size="8" text-anchor="middle">Autonomous ReAct loop</text>

  <!-- Target AWS Cloud -->
  <rect x="200" y="370" width="400" height="190" rx="12" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
  <text x="400" y="395" fill="#fef08a" font-size="14" font-weight="700" text-anchor="middle">☁️ Target AWS Cloud (Audited Context)</text>
  
  <!-- Mini AWS Service Nodes -->
  <rect x="220" y="420" width="75" height="40" rx="4" fill="#0f172a" stroke="#d97706" stroke-width="1"/>
  <text x="257" y="444" fill="#f59e0b" font-size="10" font-weight="700" text-anchor="middle">S3 / IAM</text>

  <rect x="305" y="420" width="85" height="40" rx="4" fill="#0f172a" stroke="#d97706" stroke-width="1"/>
  <text x="347" y="444" fill="#f59e0b" font-size="10" font-weight="700" text-anchor="middle">EC2 / RDS</text>

  <rect x="400" y="420" width="85" height="40" rx="4" fill="#0f172a" stroke="#d97706" stroke-width="1"/>
  <text x="442" y="444" fill="#f59e0b" font-size="9" font-weight="700" text-anchor="middle">Lambda / DDB</text>

  <rect x="495" y="420" width="85" height="40" rx="4" fill="#0f172a" stroke="#d97706" stroke-width="1"/>
  <text x="537" y="444" fill="#f59e0b" font-size="10" font-weight="700" text-anchor="middle">KMS / Trails</text>

  <rect x="220" y="480" width="360" height="50" rx="6" fill="#1e1b4b" stroke="#818cf8" stroke-width="1"/>
  <text x="400" y="502" fill="#c7d2fe" font-size="11" font-weight="700" text-anchor="middle">🛠️ AWS CloudFormation (Remediation Stack)</text>
  <text x="400" y="518" fill="#e2e8f0" font-size="9" text-anchor="middle">Applies playbooks and rolls back if execution fails</text>

  <!-- Connective Arrows & Data Flows -->
  <!-- Session storage <-> Client Browser -->
  <path d="M 250 125 L 190 125" fill="none" stroke="#ea580c" stroke-width="1.5" marker-end="url(#arrow-orange)" marker-start="url(#arrow-orange)"/>
  <text x="220" y="118" fill="#fdba74" font-size="8" text-anchor="middle">Read/Write</text>

  <!-- Client Browser -> Server Functions -->
  <path d="M 400 170 L 400 220" fill="none" stroke="#6366f1" stroke-width="2" marker-end="url(#arrow)"/>
  <text x="410" y="195" fill="#cbd5e1" font-size="9">Call RPC with Keys</text>

  <!-- Server Functions -> DB -->
  <path d="M 250 265 L 190 265" fill="none" stroke="#10b981" stroke-width="1.5" marker-end="url(#arrow-green)"/>
  <text x="220" y="258" fill="#6ee7b7" font-size="9" text-anchor="middle">Write Steps/Findings</text>

  <!-- DB -> Browser SPA (Realtime) -->
  <path d="M 110 235 L 110 175 Q 110 160 250 150" fill="none" stroke="#10b981" stroke-width="1.5" marker-end="url(#arrow-green)" stroke-dasharray="3,3"/>
  <text x="120" y="195" fill="#6ee7b7" font-size="8" font-weight="600">Real-time WebSocket Stream</text>

  <!-- Server Functions -> Gemini -->
  <path d="M 550 265 L 610 265" fill="none" stroke="#ea580c" stroke-width="1.5" marker-end="url(#arrow-orange)" marker-start="url(#arrow-orange)"/>
  <text x="580" y="258" fill="#fdba74" font-size="8" text-anchor="middle">ReAct loop</text>

  <!-- Server Functions -> AWS Cloud -->
  <path d="M 400 310 L 400 370" fill="none" stroke="#f59e0b" stroke-width="1.5" marker-end="url(#arrow)"/>
  <text x="410" y="340" fill="#cbd5e1" font-size="9">Execute Read-only Tools</text>

</svg>
</div>
<p align="center"><strong>Figure 1: Cirrus Zero-Trust Orchestration Architecture</strong></p>

### Flow-by-Flow Explanation

1. **Credentials Staging**: When users inputs AWS credentials on the frontend, the keys are cached locally in the client browser's `sessionStorage`. They are never stored in the database.
2. **Scan Initiation**: The client initiates an RPC (Remote Procedure Call) request to the server-side `runScan` function, attaching the credentials in the payload.
3. **LLM Connection**: The runner loads the agent's context and starts a conversation with `gemini-3.5-flash` using the Vercel AI SDK.
4. **Autonomous Tools Query**: The agent makes decision calls. If it chooses to audit a resource, the runner translates this into an AWS SDK V3 client query (S3, EC2, Lambda, RDS, etc.) using the temp keys.
5. **Timeline Reporting**: Every thought, action, and JSON result is written directly to the Supabase database under `agent_steps`.
6. **Real-time Streaming**: PostgreSQL emits changes through WebSockets, and the browser UI dynamically updates the console log timeline in real-time.
7. **Remediation Plan**: Clicking "Apply CloudFormation fix" executes stack deployments to repair the target system and logs each creation/rollback stack event in real time.

---

## 💻 Tech Stack

* **Frontend**: React (v19), TanStack Start (SSR), TanStack Router, Tailwind CSS (v4), Framer Motion (animations), Lucide Icons, Shadcn UI components.
* **Server**: Nitro engine (via TanStack Start), NodeJS (v20+).
* **AI Provider**: `@ai-sdk/google` (Vercel AI SDK wrapper) + Google Gemini API (`gemini-3.5-flash`).
* **Database & Auth**: Supabase PostgreSQL database, Supabase Realtime WebSocket engine, Supabase GoTrue Auth.
* **Infrastructure integration**: AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/client-iam`, `@aws-sdk/client-ec2`, etc.), Resend API (for baseline drift email alerts).

---

## ⚙️ Detailed Setup Instructions

Follow these commands to deploy the application locally:

### 1. Clone & Install
```bash
git clone https://github.com/ritvikindupuri/CIRRUSPenTest.git
cd CIRRUSPenTest
npm install
```

### 2. Configure Environment variables
Create a `.env` file in the root directory:
```bash
# Copy template or write details
notepad .env
```
Add the following keys:
```env
SUPABASE_PROJECT_ID="your_supabase_project_id"
SUPABASE_PUBLISHABLE_KEY="your_supabase_anon_publishable_key"
SUPABASE_URL="https://your_project_id.supabase.co"

GEMINI_API_KEY="your_google_gemini_api_key"
```

### 3. Initialize Database Migrations
If setting up a new Supabase project, execute the SQL migration scripts located in [supabase/migrations/](file:///C:/Users/ritvi/.gemini/antigravity/scratch/cloud-spy-nodes/supabase/migrations/) sequentially in the Supabase SQL editor:
1. `20260611175800_add_last_reminded_at.sql`
2. `20260611181200_add_resend_settings_to_profiles.sql`
3. `20260611181500_advanced_features_schema.sql`

### 4. Build and Launch
Run the Vite development server locally:
```bash
npm run dev
```
Open **[http://localhost:8080/](http://localhost:8080/)** in your browser.

---

## 🚀 How to Use the App: Click-by-Click Guide

### Step 1: Sign Up and Connect AWS Credentials
1. Navigate to the login page and sign up using your email and password.
2. Once on the Dashboard, click the **"AWS Connection Setup"** button.
3. Review the consolidated read-only policy template and create an IAM role or user in your AWS Console.
4. Copy your temporary credentials (Access Key ID, Secret Access Key, Session Token) and paste them into the credentials form modal.
5. Click **"Save Credentials"** (they will be saved in your browser's local session memory).

### Step 2: Running a Cloud Scan
1. On the dashboard, click **"New Scan"**.
2. Give the scan a descriptive name (e.g. `Weekly S3 Audit`).
3. Select which agents you want to dispatch (Recon, S3 Hunter, IAM Auditor, EC2 Network, or any Custom agents you created).
4. Specify the target AWS region (e.g. `us-east-1`).
5. Click **"Start Scan"**.

### Step 3: Monitoring the Live Agent Timeline
1. You will be redirected to the live scan page.
2. In the interactive canvas, click on any active agent node to inspect its execution.
3. In the panel, watch the reasoning logs, executed CLI commands, and raw JSON outputs stream in real-time.
4. **Filtering**: Use the filter chips (Reasoning, Commands, Outputs, Final, Violations) to isolate specific details.
5. **Regex Search**: Type text into the search bar, toggle the `.*` button, and search the timeline using regular expressions.
6. If an agent hits a safety rule violation, it will display a red block warning card detailing the forbidden command attempt.

### Step 4: Building Custom Check Agents
1. Go to the **"Custom Agents"** view from the header navigation.
2. Click **"New Agent"**.
3. Provide a name, description, and choose a theme color.
4. Select the specific AWS services the agent is allowed to access (e.g., IAM, RDS, Lambda).
5. Click **"Load Template"** to automatically populate a read-only system prompt template optimized for those services.
6. Write your instructions in the prompt. The editor runs a live DSL safety checker at the bottom to warn you of any mutating verbs.
7. Click **"Save Agent"**. It is now available to be run in scans.

### Step 5: Applying Remediation Playbooks
1. Navigate to the scan detail page after execution finishes, or click on a finding from the dashboard.
2. Click on a finding to review the risk description and severity rating.
3. Under the finding details, review the **AI-generated remediation playbook**:
   * Plain-english fix explanation.
   * AWS CLI code.
   * CloudFormation YAML configuration.
   * Rollback playbook.
4. **CFN Deployment Acknowledgment**: If the CloudFormation template adjusts IAM roles/policies, check the acknowledgment box (`CAPABILITY_NAMED_IAM`) to enable the deployment button.
5. Click **"Apply CloudFormation fix"**.
6. Expand the collapsible audit panel to watch stack events poll in real-time as the stack is created and verified.

### Step 6: Scheduling Baselines and Drift Detection
1. Go to the **"Schedules"** page from the navigation bar.
2. Click **"Create Schedule"** to configure baseline scans.
3. Define the cadence (e.g., every 7 days) and target agents.
4. If a scan is due, Cirrus sends an automated reminder email via Resend to remind you to start the scan and enter your temporary AWS keys.
