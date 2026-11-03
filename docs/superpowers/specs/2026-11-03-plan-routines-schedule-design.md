# Plan, Routines, and recurring exercises

## Intent

Make Plan the place to choose *when* to train, and Routines the place to build *what* to train. Remove the Fixed Week / Rotation choice shown in the current Plan screen. A person can choose weekdays for a routine, a class, or one exercise. A scheduled exercise starts as its own session when tapped on that day.

The owner approved the visual layout in the browser mockup on 2026-11-03 and asked that routines and classes have separate lists both when browsing them and when scheduling them. The approved local preview is `.superpowers/brainstorm/79701-1793695207/content/plan-routine-class-v2.html`; its hierarchy is spelled out below so the design remains usable without that temporary preview.

## User-visible behavior

1. The bottom navigation gains **Routines** beside **Exercises**. Plan remains a separate tab. The central Start action remains. The Routines tab has **Routines** and **Classes** views. The first shows workout routines, the second shows class/visit entries. Each view has its own create action. Existing entries retain their type; the app does not guess from a name such as “Climbing.”
2. Plan opens directly to the recurring weekly schedule. Its week calendar and day rows show the planned items. There is no Schedule / Routines switch and no Fixed Week / Rotation control. The personal rotation editor and automatic rotation are removed from the user flow.
3. **Schedule** starts with a type choice: Routine, Class, or Exercise. The next list contains only that type. Creating a new routine or class from its list is allowed. Choosing one or more weekdays makes that item recur every week on those days. The same item may be scheduled on several days and several items may share a day.
4. An exercise repeat stores its exercise plus sets, repetitions or hold time, and other configuration supported by the existing exercise editor. It remains independently editable: changing its weekdays does not change the exercise definition; editing the repeat's target does not change that exercise in another routine. Plan shows its name and days. It is not listed as a routine or class.
5. Tapping a scheduled exercise on a day starts a session containing only that exercise, even if a routine or class is planned that day. The session logs in normal workout history. The repeat remains scheduled for the next selected weekday. Tapping a routine or class on a day starts that item. The general Start action may keep its existing combined-routine behavior, but must not silently add standalone exercise repeats to that combined session.
6. A day with multiple items makes each item individually reachable. A day-specific rest/skip hides that day's recurring items without removing their future repeats. Completion is shown for an exercise repeat when its own session was logged on that date. Reopening a completed day does not erase or automatically restart it.
7. Existing weekday assignments stay in place. Old personal rotation definitions may remain in stored data for compatibility and rollback, but they no longer generate sessions or occupy Plan space. An externally supplied coach queue remains a distinct coach feature and is never labeled as personal Rotation. Existing links to routine editors should continue to open the same routine after the navigation change.

## Approved screen hierarchy

- Bottom tabs, left to right: Home, Plan, Start, Stats, Routines, Exercises. The six labels and Start action remain readable on a narrow phone.
- Plan: title, dated week calendar, the selected day's individual scheduled items, an **Add / Schedule** action, then a list of repeating assignments with their chosen weekday names and edit controls. Selecting Add first presents Routine, Class, and Exercise; the next screen or sheet is filtered to that type. The selected day's exercise item has a direct Start action for its solo session.
- Routines tab: title, Routines / Classes switch, one create action for the selected type, then the matching list. The two lists do not mix. The Routine editor remains the detailed destination for a routine; class editing retains the existing class behavior.
- If an externally supplied coach queue is active, Plan shows a distinct **Coach week** card above the personal week calendar. It keeps the existing coach order, completion, and date pin behavior. Home may keep its existing coach queue entry. No personal Rotation control appears in either place.
- If a saved personal rotation was active when the new version opens, its definition is retained but no longer starts a new session. A one-time notice points to the weekday scheduler so the person can place those routines on chosen days; existing weekday assignments are already shown.

## Repeating exercise identity

The same catalogue exercise may have several independent repeat rules, each with its own target and weekday set (for example, 5 × 5 on Monday and 3 × 10 on Thursday). Each rule has a stable identity used for editing, completion, deletion, and sync. When two rules use the same exercise, their target summary distinguishes them in Plan. Removing one rule does not remove the other or the exercise from the library.

## Constraints and anti-goals

- Preserve the user's current uncommitted UI changes in `frontend/src/views/Plan.jsx`, `frontend/src/views/Home.jsx`, `frontend/src/sheets.jsx`, `frontend/src/index.css`, their tests, and `frontend/src/components/WeekCalendar.jsx`.
- Do not alter or delete saved routines, classes, workouts, or weekday choices while changing the app. New repeat records must sync across devices using the store's conflict and deletion behavior. Backups restore them. Plan export includes repeat rules; importing without the schedule leaves their weekday assignments off, while importing with the schedule applies their weekdays alongside the imported routine/class assignments.
- Do not schedule a time of day or introduce notifications in this change; the request is for chosen weekdays.
- Keep the six bottom actions usable on a narrow phone screen and available to keyboard and screen-reader users.
- Existing catalogue images stay attached to exercises; no new media asset is needed for a repeat.

## Builder decisions

The builder may choose the internal data shape and whether a repeating exercise uses a dedicated hidden template or a separate state collection, provided the behavior above holds and sync preserves edits and deletions. The builder may choose the exact card, picker, and empty-state copy while following the approved mockup's hierarchy. The current Routines/Class separation already present in some day pickers may be reused.

## Verification targets

- Navigation reaches Plan, Routines, Classes, and Exercises from a narrow layout without obscuring Start or losing back-navigation behavior.
- A weekday can hold a routine, a class, and a recurring exercise; each is shown under the right label and starts in the intended way.
- Repeating an exercise on selected weekdays displays it only on those weekdays, skips a one-off rest day, and appears again the next week.
- Routine and Class pickers contain only matching entries. Existing profile data with `scheduleMode: 'rotation'` no longer starts a personal rotation.
- Sync, backup/restore, and plan sharing preserve or explicitly account for new exercise-repeat data.
