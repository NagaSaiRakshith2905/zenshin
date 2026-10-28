# Personal Project Management

Shared language for planning future work and tracking development across personal projects.

## Organization

**Project**:
A product, application, or other development effort containing sections and tasks.
_Avoid_: Workspace, board (when referring to the development effort)

**Section**:
A named container within a project that can contain tasks and child sections. A section can represent a feature, version, or another grouping and has a lifecycle of Planned, Active, or Completed.
_Avoid_: Folder, milestone, epic (as interchangeable names for a section)

**Child section**:
A section nested within another section in the same project.
_Avoid_: Subproject

**Feature**:
A capability planned or developed within a project; it can be represented by a section.

**Version**:
A planned or delivered iteration of a project; it can be represented by a section.
_Avoid_: Release (as an interchangeable name until release behavior is defined)

## Work

**Task**:
An actionable unit of work with its own status and tracking information, belonging directly to a project or to one section.
_Avoid_: Ticket, issue, card (as interchangeable names for a task)

**Subtask**:
A task nested under another task, with the same tracking capabilities as a task.
_Avoid_: Checklist item (when referring to a tracked subtask)

**Status**:
A task's current position in its project's workflow.
_Avoid_: State (in user-facing task workflow language)

**Workflow**:
A project's set of task statuses, mapped to the categories Backlog, Ready, In progress, In review, Done, and Canceled.

**Backlog**:
Work captured for the future and not yet committed to execution; also the workflow category for such tasks.
_Avoid_: Inbox (as an interchangeable name)

**Dependency**:
A relationship indicating that one task requires another task to finish before it can proceed.

**Blocked**:
A condition indicating unfinished prerequisites, independent of a task's workflow status.
_Avoid_: Blocked status

**Priority**:
The relative importance of a task when choosing what to work on.

**Label**:
A project-specific tag used to classify tasks, such as bug, frontend, or research.
_Avoid_: Section (when referring to a tag)

**Property**:
A project-defined custom field on tasks, such as Effort or Platform, with a fixed type (Text, Number, Date, Checkbox, Select, Multi-select, URL). Built-in fields such as status, priority and due date are not properties.
_Avoid_: Attribute, column, custom field (use Property)

**Task reference**:
A stable human-readable identifier consisting of a project prefix and task number, such as TRACK-42.
_Avoid_: Task title (when referring to the identifier)

**Due date**:
The date by which a task is intended to be completed.
_Avoid_: Deadline (as an interchangeable field label)

**Target date**:
The optional date a section is intended to reach completion.

**Progress**:
The proportion of non-canceled leaf tasks that are Done within a task or section's relevant work.

**Leaf task**:
A task with no subtasks; the unit counted in calculated progress.

## Context and presentation

**Description**:
A short explanation of a project, section, or task.

**Note**:
The editable rich-text context attached to a project, section, or task.
_Avoid_: Comment, activity entry (as interchangeable names)

**Note revision**:
A saved version of a note; restoring an earlier version produces a new revision.

**Attachment**:
A private uploaded file associated with a project, section, or task.

**Activity**:
The recorded history of changes, including whether a person or an agent made each change.
_Avoid_: Note (when referring to change history)

**View**:
A way of displaying tasks, such as a list or board.

**Board**:
A task view organized into columns by status.
_Avoid_: Project (when referring to the view)

**My work**:
The home view of actionable tasks across projects, including overdue, ready, and in-progress work.

**Ready to work**:
A task filter selecting Ready tasks without unresolved dependencies or a manual blocked reason.

**Archive**:
A reversible way to remove an item from active use while preserving its information.
_Avoid_: Delete (when referring to archiving)

## Integrations

**Agent**:
A software assistant authorized to read or modify project work on the owner's behalf.

**Agent credential**:
A revocable, optionally expiring credential granting an agent specific permissions for selected projects.
_Avoid_: Login, session (as interchangeable names)

**GitHub issue**:
An issue in a connected GitHub repository that may be linked to or explicitly imported as a task.
_Avoid_: Task (when referring to the external issue itself)

**Pull request**:
A proposed code change in a connected GitHub repository that may be linked to a task.
