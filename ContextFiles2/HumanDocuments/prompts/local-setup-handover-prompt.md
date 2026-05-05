# Task: Principal Engineer Handover — Runbook + Local Setup Guide

You are a principal engineer taking over a newly acquired system. You must get the application running and fully documented for the support team. Use this repo’s frontend and backend projects to produce a **thorough, best‑practices** guide for **installing, running, and deploying locally**. The goal is a setup path that is **easy to follow** but uses **industry‑standard practices**.

## Repo Context
- Frontend: `RG-Frontend/` (Next.js 13, pages router)
- Backend: `Lumy-Backend/` (Django 4.2)
- Docs folder: `ContextFiles2/`
- Commands are described in `AGENTS.md`

## Requirements
- Produce a **single markdown doc** that is clear and step-by-step.
- The guide **must be formatted in sections** so it is easy to follow.
- Include **prerequisites** (Node/Yarn, Python/venv, DB, OS tooling).
- Include **environment variables** (.env locations and required keys).
- Include **local run commands**, **build commands**, and **test commands**.
- Include **backend DB setup** steps (migrations, fixtures if needed).
- Include **frontend** setup steps (install, run, lint/test).
- Include **troubleshooting** section (common failures, ports, CORS).
- Include **deployment notes** for local (Docker optional if not in repo).
- Use **best practices** (venv isolation, .env.local usage, secrets hygiene).
- Provide **paths to exact files** for configs and commands.
- **Leave breadcrumbs** by adding **one or more markdown files** in the existing harness (`ContextFiles2/`) so the guide is discoverable.

## Deliverable Structure (Markdown)
1) **Overview** (what runs, ports, how frontend connects to backend)
2) **Prerequisites**
3) **Repo Layout**
4) **Environment Variables**
5) **Backend Setup (Django)**
6) **Frontend Setup (Next.js)**
7) **Running Locally (Two terminals)**
8) **Testing & Quality Checks**
9) **Troubleshooting**
10) **Deployment Notes (Local/Standard)**

## Notes
- Be explicit about default ports (e.g., 8000/3000) and base URL wiring.
- If anything is missing or ambiguous, call it out and suggest the best assumption.
- This is a handover doc: explain *why* each step exists, not just commands.
