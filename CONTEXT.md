# Skopeo

Skopeo is a code review agent for analyzing code changes and reporting review findings through local and hosted developer workflows.

## Language

**Code Review Agent**:
A system that analyzes code changes and reports review findings to developers.
_Avoid_: Code review tool, reviewer bot

**Review Finding**:
A specific concern, risk, or suggested improvement reported by Skopeo for a code change.
_Avoid_: Issue, comment, violation, problem

**Finding Category**:
A fixed label that describes the kind of concern reported by a Review Finding.
_Avoid_: Type, class, theme

**Finding Severity**:
A priority label that communicates how important a Review Finding is to address.
_Avoid_: Risk score, confidence, urgency

**Review Report**:
The user-facing output that summarizes a completed code review and any Review Findings.
_Avoid_: Transcript, checklist, review log

**Review Target**:
The code change selected for analysis by the Code Review Agent.
_Avoid_: Scope, diff, input

**Repository Root**:
The top-level working-tree directory that bounds a **Review Target** and its **Agent Tools**.
_Avoid_: Current working directory, process cwd, project path

**Skopeo User**:
A developer who runs or configures Skopeo in a local or hosted code review workflow.
_Avoid_: End user, CLI user

**Self-hoster**:
A Skopeo User who deploys and maintains the Platform API and Web Application on infrastructure they control.
_Avoid_: End user

**Single-host Operator**:
A Self-hoster who runs the supported single-host Platform deployment.
_Avoid_: Platform Operator

**Platform Operator**:
A Self-hoster who integrates the Platform API and Web Application with external ingress, PostgreSQL, or observability infrastructure.
_Avoid_: Single-host Operator

**Platform Release**:
A compatible Platform API and Web Application pair identified by one shared version independently of the CLI release lifecycle.
_Avoid_: Application release, CLI release

**Container Channel**:
A named container reference that selects either the current stable Platform Release or the latest validated development revision.
_Avoid_: Version, release

**Release Metadata**:
The package-level identity used by Skopeo at runtime, including the CLI version reported to users and telemetry.
_Avoid_: Version constant, build info

**Skopeo Configuration**:
User-controlled settings that influence how Skopeo runs across local and hosted workflows.
_Avoid_: Config management, configs

**Agent Tool**:
A repository-scoped capability the **Code Review Agent** can invoke while analyzing a **Review Target**.
_Avoid_: Code review tool, plugin, function

**Review Profile**:
A bundle of model choice, prompting, and reasoning settings that shapes how the **Code Review Agent** analyzes a **Review Target**.
_Avoid_: Preset, mode, agent config

**Review Depth**:
The amount of scrutiny, time, and cost a **Review Profile** spends producing a **Review Report** — quick, standard, or thorough.
_Avoid_: Reasoning effort, level, light/moderate/heavy

## Relationships

- A **Review Target** is analyzed by the **Code Review Agent**
- A **Code Review Agent** reports zero or more **Review Findings** for a code change
- A **Review Finding** has one **Finding Severity** and one **Finding Category**
- A **Review Report** contains zero or more **Review Findings**
- A **Review Target** belongs to one **Repository Root**
- A **Skopeo User** runs or configures the **Code Review Agent** through Skopeo's CLI
- A **Self-hoster** deploys a **Platform Release**
- A **Single-host Operator** uses the supported single-host deployment
- A **Platform Operator** integrates a **Platform Release** with external infrastructure
- **Release Metadata** identifies the running Skopeo package in user output and telemetry
- **Skopeo Configuration** influences how Skopeo runs for a **Skopeo User**
- A **Code Review Agent** may invoke **Agent Tools** while analyzing a **Review Target**
- A **Review Profile** pairs one **Review Depth** with one model
- The **Code Review Agent** analyzes each **Review Target** using exactly one **Review Profile**

## Example dialogue

> **Dev:** "If I want a deeper review, do I just raise the model's reasoning effort?"
> **Domain expert:** "No — you pick a **Review Profile** with a higher **Review Depth**. Reasoning effort is one vendor knob inside the profile; the prompts and tool budget change along with it."
> **Dev:** "And if I keep the **Review Depth** but switch the profile to another model?"
> **Domain expert:** "The whole bundle swaps. Each model has its own prompts tuned to it, so only the **Review Depth** intent carries over — never the other model's prompts or settings."
