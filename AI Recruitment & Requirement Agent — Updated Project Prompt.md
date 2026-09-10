# AI Recruitment & Requirement Agent — Updated Project Prompt

## 1. Project Overview

Build a modern, professional **AI-powered Recruitment & Requirement Management Platform** designed specifically for HR teams.

The platform should allow HR users to:

1. Create and manage Job Descriptions (JDs).
2. Assign/involve other HR team members or employees in recruitment.
3. Maintain complete historical versions and timelines of each JD.
4. Search and manage candidates using a JD.
5. Rank candidates based on their match with the JD.
6. Track the complete recruitment/interview lifecycle of each candidate.
7. Track candidates from the **first HR contact until onboarding**.
8. Provide a clean, professional, highly engaging recruitment management experience.

### Current MVP Scope

For the current version, **do not implement real external candidate-source integrations yet**.

Instead:

- Create the complete PostgreSQL database schema.
- Create all required tables and relationships.
- Insert realistic fake/sample data into PostgreSQL.
- Build the frontend using this fake database data.
- Build the APIs required to read and manage the data.
- Design the architecture so that real integrations with Naukri, LinkedIn, referral email, and other sources can be added later.

The primary goal of this MVP is to demonstrate the **complete UI, database structure, recruitment workflow, timeline, candidate ranking, and user experience**.

---

# 2. Core User Flow

The overall workflow should be:

**Login → Job Descriptions → Create/View JD → Involve Recruitment Members → Search Candidates → Candidate Ranking → Candidate Details → HR Contact → Interview Process → Selection → Offer → Onboarding**

The complete recruitment journey should be traceable from a single platform.

---

# 3. Authentication / Login Page

Create a highly professional login page.

### Requirements

- Modern enterprise SaaS design.
- Clean and minimal layout.
- Professional typography.
- Responsive design.
- Attractive but subtle animations.
- Email/username field.
- Password field.
- Show/hide password.
- Remember me option.
- Forgot password option.
- Login button.
- Loading state.
- Proper validation.
- Authentication error handling.

The login page should communicate:

> **AI-powered recruitment intelligence**

Avoid creating a generic/basic login page.

---

# 4. User Profile Pictures

Each user in the system should have a **profile picture/avatar**.

Profile pictures should be displayed as a **small circular image** throughout the application wherever users are referenced.

Examples:

- Logged-in HR user.
- HR users involved in recruitment.
- Employees involved in recruitment.
- JD creator.
- JD editor.
- Candidate recruiter/owner.
- Interviewer.
- Users performing timeline activities.

### UI Requirements

Use small circular avatars such as:

**[Profile Picture] Rahul**

or:

**[Profile Picture] Rahul • HR Manager**

For areas where multiple users are involved, use an avatar group.

Example:

**Recruitment Team**

`[Avatar] [Avatar] [Avatar] +3`

Hovering over an avatar can display the user's name and role.

If a user does not have a profile picture, display a professional fallback avatar using their initials.

Profile pictures should improve the visual quality of the application without making the UI cluttered.

---

# 5. Main Application Navigation

After successful login, the user should enter the main application.

Suggested navigation:

- Job Descriptions
- Search Candidates
- Candidates
- Interviews
- Notifications
- Profile / Settings

Use a clean and modern navigation system.

The navigation should be consistent throughout the application.

---

# 6. Job Description Management Page

After login, the primary page should be the **Job Description Management** page.

Display all Job Descriptions associated with the logged-in user.

Each JD should display:

- Job title
- Department
- Location
- Employment type
- Created by
- Creator profile picture
- Created date
- Last updated date
- JD status
- Number of candidates
- Number shortlisted
- Number interviewed
- Number selected
- Number onboarded

Provide a prominent:

**+ Create New Job Description**

button.

---

# 7. Create New Job Description

When the HR user clicks **Create New Job Description**, open a professional JD creation interface.

The user should be able to enter:

- Job title
- Department
- Location
- Experience required
- Employment type
- Salary range
- Required skills
- Preferred skills
- Educational requirements
- Job responsibilities
- Required qualifications
- Additional requirements
- Full Job Description

Provide:

- Save as Draft
- Preview
- Create Job Description
- Cancel

---

# 8. Recruitment Participants — "People Involved in the Recruitment"

While creating a new Job Description, the HR user should be able to select other HR users or employees who will be involved in the recruitment process.

Use the exact UI terminology:

## People Involved in the Recruitment

This section should allow the JD creator to select one or more users.

For example:

**People Involved in the Recruitment**

- [Profile Picture] Rahul — HR Manager
- [Profile Picture] Priya — HR Executive
- [Profile Picture] Arun — Engineering Manager
- [Profile Picture] Divya — Technical Interviewer

### Selection UI

Provide a professional multi-select component.

The HR user should be able to:

- Search people by name.
- Search by role/department.
- Select multiple people.
- Remove selected people.
- View profile pictures.
- View employee name.
- View employee role/designation.

Example:

```text
People Involved in the Recruitment

┌──────────────────────────────────────────┐
│ 🔍 Search employees...                   │
└──────────────────────────────────────────┘

Selected:

○ Rahul       HR Manager
○ Priya       HR Executive
○ Arun        Engineering Manager
```

The selected people should be associated with that specific Job Description in the database.

These users should also be visible on the JD detail page.

---

# 9. Job Description List

Previously created JDs should be displayed in a professional table/card layout.

The user should be able to:

- Search JDs.
- Filter JDs.
- Sort JDs.
- View JD.
- Edit JD.
- Duplicate JD.
- Archive JD.
- Delete JD with confirmation.
- Open JD timeline.
- Search candidates using the JD.

Each JD should have a clear **View Details / Open** action.

Display the JD creator's small circular profile picture.

If multiple people are involved, show an avatar group.

Example:

**People Involved**

`[Avatar] [Avatar] [Avatar] +2`

---

# 10. Job Description Detail Page

When the HR user clicks an existing JD, open a detailed JD page.

## JD Overview

Display:

- Job title
- Department
- Location
- Experience
- Required skills
- Preferred skills
- Responsibilities
- Qualifications
- Current status
- Created by
- Creator profile picture
- Created date
- Last modified date

## People Involved in the Recruitment

Display all users assigned to the recruitment.

Each person should be displayed with:

- Profile picture
- Name
- Designation
- Role in recruitment

Example:

**People Involved in the Recruitment**

`[Avatar] Rahul — HR Manager`

`[Avatar] Priya — HR Executive`

`[Avatar] Arun — Engineering Manager`

---

# 11. Recruitment Summary

Show high-level recruitment metrics:

- Total candidates found
- Candidates shortlisted
- Candidates contacted
- Candidates in interview
- Candidates selected
- Candidates rejected
- Candidates onboarded

Use professional metric cards.

---

# 12. Job Description Timeline / History

The JD detail page must contain a **complete recruitment timeline**.

However, the timeline must also provide a **filter/selection system**.

## Timeline Filters

At the top of the timeline, provide selectable filters using checkboxes, toggles, chips, or another clean selection UI.

Example:

**Timeline Filters**

☑ Job Description

☑ Candidate Search

☑ Candidate Shortlisted

☑ Candidate Contact

☑ Interview

☑ Interview Feedback

☑ Candidate Selected

☑ Offer

☑ Onboarding

The user should be able to select or deselect each event category.

### Dynamic Timeline Behavior

The timeline must dynamically update based on the selected filters.

For example:

If the user selects:

☑ Job Description

☑ Interview

☑ Candidate Selected

Then the timeline should show only:

**Job Description events**

**Interview events**

**Candidate Selection events**

If the user deselects:

☐ Job Description

Then all Job Description-related events must disappear from the timeline.

The timeline should immediately update without requiring a page refresh.

---

# 13. Timeline Example

Example timeline:

### ☑ Job Description

**11 Sep 2026 — 09:30 AM**

[Profile Picture] Rahul created the Job Description.

---

### ☑ Candidate Search

**11 Sep 2026 — 10:15 AM**

[Profile Picture] Priya searched for candidates.

**127 candidates found**

---

### ☑ Candidate Shortlisted

**11 Sep 2026 — 11:00 AM**

[Profile Picture] Rahul shortlisted:

- John Doe
- Jane Smith
- Alex Kumar

---

### ☑ Candidate Contact

**11 Sep 2026 — 02:30 PM**

[Profile Picture] Priya contacted John Doe.

**Status:** Connected

---

### ☑ Interview

**12 Sep 2026 — 03:00 PM**

Technical Interview scheduled.

**Interviewer:** [Profile Picture] Arun

---

### ☑ Interview Feedback

**12 Sep 2026 — 05:00 PM**

[Profile Picture] Arun submitted interview feedback.

**Score:** 8.5/10

**Recommendation:** Proceed

---

### ☑ Candidate Selected

**14 Sep 2026 — 11:00 AM**

John Doe selected for the position.

---

### ☑ Offer

**15 Sep 2026 — 10:00 AM**

Offer sent to John Doe.

---

### ☑ Onboarding

**20 Sep 2026 — 09:00 AM**

John Doe successfully onboarded.

---

# 14. Timeline UI Requirements

The timeline should look visually modern.

Use:

- Circular timeline indicators.
- Small user profile pictures.
- Status icons.
- Date/time.
- Event descriptions.
- User information.
- Expand/collapse details.
- Color/status indicators where appropriate.
- Smooth filtering.

The timeline should clearly communicate **who did what and when**.

---

# 15. Search Candidates Page

Create a dedicated page:

# Search Candidates

The HR user should be able to select an existing Job Description and use it as the candidate search criteria.

Example:

**Selected Job Description**

> Senior Python Developer

Then allow the HR user to select candidate sources.

---

# 16. Candidate Sources

The final system should support:

1. Internal Database
2. Referral Email
3. Naukri
4. LinkedIn

And:

**Search All Sources**

However, for the **current MVP**, these integrations should NOT be implemented.

Instead, create realistic fake candidate data representing candidates from these sources.

Example candidate sources:

- Internal
- Referral
- Naukri
- LinkedIn

The architecture should still be designed so real integrations can be added later.

---

# 17. Fake Candidate Data

Create realistic fake candidate records in PostgreSQL.

Candidate information should include:

- Name
- Profile picture/avatar
- Email
- Phone
- Location
- Current company
- Previous companies
- Years of experience
- Skills
- Education
- Certifications
- Resume information
- Candidate source
- LinkedIn profile placeholder
- Candidate status
- Created date
- Updated date

Create enough fake data to properly demonstrate:

- Candidate search
- Ranking
- Filtering
- Sorting
- Candidate details
- Recruitment pipeline
- Timeline
- Interview tracking

---

# 18. Candidate Matching

For the MVP, implement candidate matching using the available JD and fake candidate data.

Each candidate should receive a match percentage.

Example:

**95% Match**

The score should consider factors such as:

- Required skills
- Preferred skills
- Years of experience
- Relevant experience
- Education
- Certifications
- Domain experience
- JD responsibilities

The matching architecture should be modular so an advanced AI matching engine can be integrated later.

---

# 19. Candidate Ranking

Sort candidates by match percentage in descending order.

Example:

| Rank | Candidate | Match | Experience | Source | Status |
|---|---|---:|---:|---|---|
| 1 | John Doe | 95% | 6 years | LinkedIn | Shortlisted |
| 2 | Jane Smith | 92% | 5 years | Naukri | New |
| 3 | Alex Kumar | 89% | 7 years | Referral | Contacted |
| 4 | David Raj | 85% | 4 years | Internal | New |

The highest matching candidate should appear first.

---

# 20. Candidate Profile UI

Each candidate should have a professional profile presentation.

Display:

- Circular profile picture.
- Candidate name.
- Match percentage.
- Experience.
- Current company.
- Skills.
- Location.
- Candidate source.
- Recruitment status.
- Last activity.

Example:

**[Profile Picture] John Doe**

**95% Match**

Python • Django • FastAPI • PostgreSQL • AWS

6 years experience

**Sources:** Internal + LinkedIn

**Status:** Technical Interview

---

# 21. Candidate Detail Page

When the HR user opens a candidate, show a complete candidate profile.

## Candidate Overview

Display:

- Large profile picture.
- Name.
- Contact information.
- Location.
- Current company.
- Experience.
- Skills.
- Education.
- Certifications.
- Resume.
- Professional profiles where permitted.

---

# 22. AI Match Analysis

Display:

**Overall Match: 95%**

Show detailed matching information:

- Skills Match
- Experience Match
- Education Match
- Domain Match
- Responsibility Match

Also display:

### Strengths

- Strong Python experience.
- Good backend development experience.
- Relevant AWS experience.

### Gaps

- Limited Kubernetes experience.
- No direct healthcare domain experience.

This should help HR understand why the candidate received the particular score.

---

# 23. Candidate Recruitment Timeline

Every candidate should have a complete recruitment timeline.

Example:

**Candidate Added**

↓

**AI Matched**

↓

**Shortlisted**

↓

**HR First Contact**

↓

**Phone Screening**

↓

**Interview Scheduled**

↓

**Technical Interview**

↓

**HR Interview**

↓

**Final Interview**

↓

**Selected**

↓

**Offer Released**

↓

**Offer Accepted**

↓

**Onboarding**

↓

**Onboarded**

Every event should contain:

- Date
- Time
- Status
- User profile picture
- User name
- Notes
- Comments
- Next action

---

# 24. Recruitment Status

Support statuses such as:

1. New
2. AI Shortlisted
3. HR Review
4. Contact Pending
5. Contacted
6. Phone Screening
7. Interview Scheduled
8. Technical Interview
9. HR Interview
10. Final Interview
11. Selected
12. Offer Sent
13. Offer Accepted
14. Onboarding
15. Onboarded
16. Rejected
17. Withdrawn
18. On Hold

The current status should always be clearly visible.

---

# 25. Interview Tracking

HR should be able to track interviews.

Interview information:

- Candidate
- Job Description
- Interview round
- Interviewer
- Interview date
- Interview time
- Interview type
- Meeting link
- Interview status
- Interview feedback
- Interview score
- Recommendation

Display interviewer profile picture.

Example:

**Technical Interview**

**Interviewer:** [Profile Picture] Arun Kumar

**Status:** Completed

**Score:** 8.5/10

**Recommendation:** Proceed

---

# 26. Candidate Communication Tracking

Track HR interactions with candidates.

Example:

**11 Sep 2026 — 10:30 AM**

[Profile Picture] Priya contacted John Doe.

**Status:** Connected

**Notes:** Candidate is interested.

**Next Action:** Schedule technical interview.

Every communication should become part of the candidate timeline.

---

# 27. Recruitment Kanban Board

Provide an optional Kanban view.

Columns:

**New → Shortlisted → Contacted → Screening → Interview → Selected → Offer → Onboarding**

Candidates should be visually represented as cards.

Candidate cards should include:

- Profile picture.
- Name.
- Match percentage.
- Experience.
- Current status.

---

# 28. Dashboard

Create a professional recruitment dashboard.

Display:

- Active Job Descriptions
- Total Candidates
- New Candidates
- Shortlisted Candidates
- Interviews Scheduled
- Candidates Selected
- Offers Pending
- Candidates Onboarded

Also include:

### Recruitment Funnel

**Candidates Found → Shortlisted → Contacted → Interviewed → Selected → Onboarded**

### Recent Activity

Show recent recruitment activities with user profile pictures.

### Top Candidates

Show the highest-ranked candidates.

---

# 29. PostgreSQL Database — Current MVP

For the current MVP, PostgreSQL is the primary data source.

Create a proper relational database.

Suggested tables:

### Users

- id
- name
- email
- password/auth reference
- designation
- department
- profile_picture
- created_at
- updated_at

### Job Descriptions

- id
- title
- department
- location
- employment_type
- experience
- salary_range
- description
- status
- created_by
- created_at
- updated_at

### Job Description Versions

- id
- job_description_id
- version
- content
- created_by
- created_at

### Recruitment Participants

- id
- job_description_id
- user_id
- role_in_recruitment
- created_at

This table connects:

**Job Description ↔ People Involved in the Recruitment**

### Candidates

- id
- name
- profile_picture
- email
- phone
- location
- current_company
- experience
- education
- resume
- created_at
- updated_at

### Candidate Skills

- id
- candidate_id
- skill
- proficiency

### Candidate Sources

- id
- candidate_id
- source
- source_reference

Example sources:

- Internal
- Referral
- Naukri
- LinkedIn

### Candidate Matches

- id
- candidate_id
- job_description_id
- match_percentage
- skill_score
- experience_score
- education_score
- domain_score
- created_at

### Candidate Activities

- id
- candidate_id
- job_description_id
- activity_type
- description
- performed_by
- created_at

### Interviews

- id
- candidate_id
- job_description_id
- interviewer_id
- interview_round
- scheduled_at
- status
- score
- feedback
- recommendation

### Offers

- id
- candidate_id
- job_description_id
- status
- offered_at
- accepted_at

### Onboarding

- id
- candidate_id
- job_description_id
- status
- onboarding_date
- completed_at

### Notifications

- id
- user_id
- title
- message
- notification_type
- is_read
- created_at

---

# 30. Fake Data / Seed Data

Create a database seeding mechanism.

The application should automatically be able to populate PostgreSQL with realistic fake data.

Include:

### Users

At least several HR employees/recruiters/interviewers.

Each user should have:

- Name
- Designation
- Department
- Profile picture/avatar
- Email

### Job Descriptions

Create multiple realistic JDs such as:

- Senior Python Developer
- React Developer
- AI Engineer
- Data Scientist
- DevOps Engineer

### Candidates

Create multiple candidates for each JD.

Candidates should have different:

- Skills
- Experience
- Sources
- Match scores
- Recruitment statuses
- Interview statuses

### Recruitment History

Create realistic historical events so that the timeline UI is populated immediately.

---

# 31. Database-First MVP Requirement

For this version, prioritize:

**PostgreSQL → Backend APIs → Frontend UI**

Do not spend time implementing real external recruitment integrations.

The application should demonstrate the complete recruitment experience using seeded fake data.

The fake data should behave like real production data.

The architecture must make it easy to replace fake candidate sources with real integrations later.

---

# 32. Future Integration Architecture

Design the backend using a candidate-source abstraction.

Conceptually:

**Candidate Source Interface**

↓

Internal Candidate Provider

Referral Email Provider

Naukri Provider

LinkedIn Provider

Future ATS Provider

Future Indeed Provider

Each provider should eventually return normalized candidate data.

For the MVP, only the **mock/fake providers** need to be implemented.

---

# 33. Security

Implement:

- Secure authentication.
- Authorization.
- Role-based access control.
- API authentication.
- Input validation.
- Secure file handling.
- Protection of candidate PII.
- Secure database access.
- Audit logging.
- Proper secrets management.

---

# 34. UI/UX — Highest Priority

UI/UX is one of the **most important requirements of this project**.

The application must look like a premium enterprise SaaS product.

The design should be:

- Modern
- Elegant
- Professional
- Clean
- Minimal
- Responsive
- Engaging
- User-friendly
- Data-focused

Avoid a generic admin-dashboard appearance.

Use:

- Professional typography.
- Consistent spacing.
- Clean cards.
- Modern tables.
- Circular profile pictures.
- Avatar groups.
- Elegant status badges.
- Progress indicators.
- Timeline components.
- Charts.
- Smooth subtle animations.
- Skeleton loaders.
- Empty states.
- Error states.
- Confirmation dialogs.
- Tooltips.

The UI should make HR users feel that they are using a **premium AI recruitment platform**.

---

# 35. Profile Picture Design Standard

Profile pictures should be consistently displayed across the application.

### Small Avatar

Used in:

- Tables
- Timeline events
- Activity logs
- Navigation
- Candidate lists

### Medium Avatar

Used in:

- Candidate cards
- Recruitment participant lists
- Interview information

### Large Avatar

Used in:

- Candidate detail page
- User profile page

Use circular avatars throughout the application.

If no image exists, generate an initials-based fallback avatar.

---

# 36. Responsive Design

The application should work on:

- Desktop
- Laptop
- Tablet
- Mobile

Primary focus should be professional desktop HR workflows.

---

# 37. Performance

Implement:

- Pagination.
- Efficient database queries.
- Server-side filtering where appropriate.
- Server-side sorting where appropriate.
- Loading states.
- Skeleton loaders.
- Efficient API responses.
- Async processing architecture for future AI operations.

The UI should never appear frozen.

---

# 38. Final MVP Architecture

The current MVP should conceptually work as:

**Login**

↓

**Job Description Management**

↓

**Create Job Description**

↓

**Select "People Involved in the Recruitment"**

↓

**Store JD + Recruitment Participants in PostgreSQL**

↓

**View JD Timeline**

↓

**Select Timeline Filters**

↓

**Dynamic Timeline**

↓

**Search Candidates**

↓

**Fake Candidate Sources**

↓

**Candidate Normalization**

↓

**Candidate Matching**

↓

**Match Percentage**

↓

**Candidate Ranking**

↓

**Candidate Details**

↓

**HR Contact**

↓

**Interview Tracking**

↓

**Selection**

↓

**Offer**

↓

**Onboarding**

All data should currently come from the PostgreSQL database populated with realistic fake data.

---

# 39. Important Implementation Rule

Do not over-engineer external integrations at this stage.

The current goal is to build a **high-quality working MVP** with:

**Professional UI + PostgreSQL + Backend APIs + Fake Data + Complete Recruitment Workflow**

The application should be designed so that external integrations can be plugged in later without major architectural changes.

---

# 40. Final Product Goal

The final MVP should feel like a complete **AI Recruitment Operating System**.

The HR user should be able to:

**Create JD**

→

**Select People Involved in the Recruitment**

→

**View JD**

→

**View filtered recruitment timeline**

→

**Search candidates**

→

**See AI match percentage**

→

**Review ranked candidates**

→

**Contact candidate**

→

**Track interviews**

→

**Select candidate**

→

**Manage offer**

→

**Track onboarding**

Every important action should be recorded in PostgreSQL and reflected in the UI.

The final interface should be polished enough to demonstrate to:

- HR teams
- Recruitment managers
- Company leadership
- Clients
- Investors

The highest priorities are:

1. **Premium professional UI/UX**
2. **Excellent user experience**
3. **Circular user profile pictures throughout the application**
4. **"People Involved in the Recruitment" functionality**
5. **Dynamic timeline filtering**
6. **PostgreSQL database**
7. **Realistic fake/seed data**
8. **Candidate ranking**
9. **Complete recruitment lifecycle tracking**
10. **Future-ready architecture for real candidate-source integrations**