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

**Skopeo User**:
A developer who runs or configures Skopeo in a local or hosted code review workflow.
_Avoid_: Operator, end user, CLI user

**Release Metadata**:
The package-level identity used by Skopeo at runtime, including the CLI version reported to users and telemetry.
_Avoid_: Version constant, build info

**Skopeo Configuration**:
User-controlled settings that influence how Skopeo runs across local and hosted workflows.
_Avoid_: Config management, configs

## Relationships

- A **Review Target** is analyzed by the **Code Review Agent**
- A **Code Review Agent** reports zero or more **Review Findings** for a code change
- A **Review Finding** has one **Finding Severity** and one **Finding Category**
- A **Review Report** contains zero or more **Review Findings**
- A **Skopeo User** runs or configures the **Code Review Agent** through Skopeo's CLI
- **Release Metadata** identifies the running Skopeo package in user output and telemetry
- **Skopeo Configuration** influences how Skopeo runs for a **Skopeo User**
