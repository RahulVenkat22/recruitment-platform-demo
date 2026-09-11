"""Name, place, employer, title and education pools for generated candidates
(plan.md section 10 "Candidates"). Pure data plus two tiny helpers.
"""

from __future__ import annotations

from typing import NamedTuple

# ------------------------------------------------------------------ role families

# One family per seeded JD (plan.md section 10 table); keys shared with
# ``jobs.JobSpec.role_family``, ``JOB_TITLES_BY_FAMILY`` and the text templates.
ROLE_FAMILIES: tuple[str, ...] = ("backend", "frontend", "ai_ml", "data_science", "devops", "qa")

SENIORITY_LEVELS: tuple[str, ...] = ("junior", "mid", "senior", "lead")


def seniority_for(total_experience_years: float) -> str:
    """Bucket total experience into a seniority level used to pick job titles."""
    if total_experience_years < 2:
        return "junior"
    if total_experience_years < 5:
        return "mid"
    if total_experience_years < 9:
        return "senior"
    return "lead"


# ------------------------------------------------------------------------ names

MALE_FIRST_NAMES: tuple[str, ...] = (
    "Aarav", "Abhinav", "Abhishek", "Aditya", "Ajay", "Akash", "Akhil", "Amit", "Anand",
    "Aniket", "Anil", "Ankit", "Anirudh", "Arjun", "Arun", "Arvind", "Ashok", "Ashwin",
    "Balaji", "Bharath", "Chandan", "Chetan", "Deepak", "Dhruv", "Dinesh", "Ganesh", "Gaurav",
    "Gokul", "Gopal", "Harish", "Hari", "Harsha", "Hemant", "Ishaan", "Jagan", "Jayant",
    "Karan", "Karthik", "Kiran", "Krishna", "Kunal", "Lokesh", "Madhav", "Mahesh", "Manoj",
    "Manish", "Mohan", "Mukesh", "Naveen", "Nikhil", "Nitin", "Pankaj", "Pradeep", "Prakash",
    "Pranav", "Prasad", "Praveen", "Rajesh", "Rakesh", "Ramesh", "Ravi", "Rohan", "Rohit",
    "Sachin", "Sai", "Sandeep", "Sanjay", "Santosh", "Saravanan", "Satish", "Senthil",
    "Shankar", "Shiva", "Shyam", "Siddharth", "Sridhar", "Srinivas", "Sunil", "Suraj",
    "Suresh", "Tarun", "Uday", "Varun", "Venkat", "Vignesh", "Vijay", "Vikas", "Vinay",
    "Vinod", "Vishal", "Vishnu", "Yash", "Rahul", "Vikram",
)  # fmt: skip

FEMALE_FIRST_NAMES: tuple[str, ...] = (
    "Aishwarya", "Akshara", "Amrita", "Ananya", "Anjali", "Anjana", "Anusha", "Aparna",
    "Archana", "Arathi", "Asha", "Bhavana", "Bhavya", "Chitra", "Deepa", "Deepika", "Divya",
    "Durga", "Gayathri", "Geetha", "Harini", "Hema", "Indira", "Ishita", "Janani", "Jyoti",
    "Kavitha", "Kavya", "Keerthi", "Kirti", "Lakshmi", "Lavanya", "Madhavi", "Madhu", "Malini",
    "Meena", "Meera", "Megha", "Mounika", "Nandini", "Neha", "Nisha", "Nithya", "Padma",
    "Pallavi", "Pavithra", "Pooja", "Prathiba", "Preethi", "Priya", "Priyanka", "Radha", "Ramya",
    "Ranjani", "Rashmi", "Rekha", "Renuka", "Revathi", "Riya", "Roshni", "Sahana", "Sandhya",
    "Sangeetha", "Sanjana", "Saranya", "Sarita", "Shalini", "Shilpa", "Shreya", "Shruti",
    "Shweta", "Sindhu", "Smitha", "Sneha", "Sowmya", "Sruthi", "Subha", "Sudha", "Suma",
    "Sunita", "Swathi", "Swetha", "Tanvi", "Tejaswini", "Uma", "Usha", "Vaishnavi", "Vandana",
    "Varsha", "Vidya", "Vinitha", "Yamini", "Anitha",
)  # fmt: skip

LAST_NAMES: tuple[str, ...] = (
    "Iyer", "Sharma", "Kumar", "Rajan", "Raman", "Menon", "Patel", "Shah", "Narayanan", "Reddy",
    "Rao", "Nair", "Pillai", "Krishnan", "Subramanian", "Venkatesan", "Balasubramanian",
    "Chandrasekhar", "Srinivasan", "Ramachandran", "Raghavan", "Gupta", "Agarwal", "Verma",
    "Singh", "Mishra", "Joshi", "Desai", "Mehta", "Bhat", "Hegde", "Kulkarni", "Deshpande",
    "Patil", "Shetty", "Kamath", "Naidu", "Chowdhury", "Banerjee", "Mukherjee", "Chatterjee",
    "Das", "Ghosh", "Bose", "Sen", "Dutta", "Roy", "Mahajan", "Malhotra", "Kapoor", "Khanna",
    "Bhatia", "Chopra", "Saxena", "Tiwari", "Pandey", "Dubey", "Yadav", "Jain", "Goel", "Arora",
    "Sethi", "Varma", "Thomas", "George", "Mathew", "Fernandes", "D'Souza", "Prabhu", "Anand",
    "Mohan", "Sundaram", "Ganesan", "Murthy",
)  # fmt: skip

# ----------------------------------------------------------------------- places


class City(NamedTuple):
    name: str
    state: str


CITIES: tuple[City, ...] = (
    City("Chennai", "Tamil Nadu"),
    City("Bengaluru", "Karnataka"),
    City("Hyderabad", "Telangana"),
    City("Pune", "Maharashtra"),
    City("Mumbai", "Maharashtra"),
    City("Delhi NCR", "Delhi"),
    City("Kolkata", "West Bengal"),
    City("Coimbatore", "Tamil Nadu"),
    City("Kochi", "Kerala"),
    City("Ahmedabad", "Gujarat"),
)

CITIES_BY_NAME: dict[str, City] = {city.name: city for city in CITIES}


def location_label(city: City) -> str:
    """Format a city as "Chennai, Tamil Nadu", the shape stored in ``Candidate.location``."""
    return f"{city.name}, {city.state}"


# --------------------------------------------------------------------- employers


class Company(NamedTuple):
    name: str
    tier: str  # one of COMPANY_TIERS
    domain: str  # one of skills.DOMAINS; drives CandidateExperience.domain
    city: str  # headquarters, one of CITIES


COMPANY_TIERS: tuple[str, ...] = ("product", "services", "unicorn", "startup")

COMPANIES: tuple[Company, ...] = (
    # Product companies
    Company("Zoho", "product", "saas", "Chennai"),
    Company("Freshworks", "product", "saas", "Chennai"),
    Company("Chargebee", "product", "saas", "Chennai"),
    Company("Kissflow", "product", "saas", "Chennai"),
    # IT services and consulting
    Company("Infosys", "services", "enterprise software", "Bengaluru"),
    Company("TCS", "services", "banking", "Mumbai"),
    Company("Wipro", "services", "enterprise software", "Bengaluru"),
    Company("HCL", "services", "telecom", "Delhi NCR"),
    Company("Mindtree", "services", "retail", "Bengaluru"),
    Company("Cognizant", "services", "healthcare", "Chennai"),
    Company("Accenture", "services", "banking", "Bengaluru"),
    Company("ThoughtWorks", "services", "enterprise software", "Bengaluru"),
    # Consumer internet unicorns
    Company("Razorpay", "unicorn", "fintech", "Bengaluru"),
    Company("Swiggy", "unicorn", "ecommerce", "Bengaluru"),
    Company("Zomato", "unicorn", "ecommerce", "Delhi NCR"),
    Company("Flipkart", "unicorn", "ecommerce", "Bengaluru"),
    Company("PhonePe", "unicorn", "fintech", "Bengaluru"),
    Company("CRED", "unicorn", "fintech", "Bengaluru"),
    Company("Paytm", "unicorn", "fintech", "Delhi NCR"),
    # Plausible (fictional) startups
    Company("Ledgerly", "startup", "fintech", "Chennai"),
    Company("FinBridge Capital", "startup", "banking", "Mumbai"),
    Company("QuantLeap AI", "startup", "fintech", "Hyderabad"),
    Company("Polisure", "startup", "insurance", "Mumbai"),
    Company("CarePulse Health", "startup", "healthcare", "Bengaluru"),
    Company("Medisync", "startup", "healthcare", "Kochi"),
    Company("Nimbus Health", "startup", "healthcare", "Chennai"),
    Company("PharmaGrid", "startup", "pharma", "Hyderabad"),
    Company("Zestcart", "startup", "ecommerce", "Bengaluru"),
    Company("Kiranaz", "startup", "retail", "Ahmedabad"),
    Company("Tutorix", "startup", "edtech", "Pune"),
    Company("Learnloop", "startup", "edtech", "Chennai"),
    Company("Vayu Logistics", "startup", "logistics", "Mumbai"),
    Company("Skyroute", "startup", "logistics", "Kolkata"),
    Company("Neuralyx Labs", "startup", "saas", "Bengaluru"),
    Company("Stackhive", "startup", "saas", "Coimbatore"),
    Company("Orbitel Networks", "startup", "telecom", "Delhi NCR"),
    Company("TripNest", "startup", "travel", "Bengaluru"),
)

COMPANIES_BY_TIER: dict[str, tuple[Company, ...]] = {
    tier: tuple(company for company in COMPANIES if company.tier == tier) for tier in COMPANY_TIERS
}

COMPANIES_BY_NAME: dict[str, Company] = {company.name: company for company in COMPANIES}

# ------------------------------------------------------------------------ titles

JOB_TITLES_BY_FAMILY: dict[str, dict[str, tuple[str, ...]]] = {
    "backend": {
        "junior": ("Software Engineer", "Backend Developer", "Python Developer"),
        "mid": ("Software Engineer II", "Backend Engineer", "Python Developer"),
        "senior": (
            "Senior Software Engineer",
            "Senior Backend Engineer",
            "Senior Python Developer",
        ),
        "lead": ("Lead Backend Engineer", "Staff Engineer", "Engineering Manager"),
    },
    "frontend": {
        "junior": ("Frontend Developer", "UI Developer", "React Developer"),
        "mid": ("Frontend Engineer", "React Developer", "Software Engineer (Frontend)"),
        "senior": ("Senior Frontend Engineer", "Senior React Developer"),
        "lead": ("Frontend Lead", "Staff Frontend Engineer", "Principal UI Engineer"),
    },
    "ai_ml": {
        "junior": ("ML Engineer", "AI Engineer", "Machine Learning Developer"),
        "mid": ("Machine Learning Engineer", "AI Engineer", "Applied Scientist"),
        "senior": ("Senior ML Engineer", "Senior AI Engineer", "Senior Applied Scientist"),
        "lead": ("Lead ML Engineer", "Principal AI Engineer", "Head of AI"),
    },
    "data_science": {
        "junior": ("Data Analyst", "Junior Data Scientist", "Business Analyst"),
        "mid": ("Data Scientist", "Analytics Engineer", "Data Analyst II"),
        "senior": ("Senior Data Scientist", "Senior Analytics Engineer"),
        "lead": ("Lead Data Scientist", "Principal Data Scientist", "Analytics Manager"),
    },
    "devops": {
        "junior": ("DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer"),
        "mid": ("DevOps Engineer II", "Platform Engineer", "Site Reliability Engineer"),
        "senior": ("Senior DevOps Engineer", "Senior Platform Engineer", "Senior SRE"),
        "lead": ("DevOps Lead", "Staff Platform Engineer", "Infrastructure Architect"),
    },
    "qa": {
        "junior": ("QA Engineer", "Test Engineer", "Automation Tester"),
        "mid": ("QA Automation Engineer", "SDET", "Test Automation Engineer"),
        "senior": ("Senior QA Automation Engineer", "Senior SDET"),
        "lead": ("QA Lead", "Test Architect", "Quality Engineering Manager"),
    },
}

# --------------------------------------------------------------------- education

DEGREES: tuple[str, ...] = ("B.Tech", "B.E", "M.Tech", "MCA", "B.Sc", "M.Sc", "MBA", "PhD")

# Level used by the education component of the match engine (plan.md 6.6).
DEGREE_LEVELS: dict[str, str] = {
    "B.Tech": "bachelor",
    "B.E": "bachelor",
    "B.Sc": "bachelor",
    "M.Tech": "master",
    "MCA": "master",
    "M.Sc": "master",
    "MBA": "master",
    "PhD": "phd",
}

FIELDS_OF_STUDY: tuple[str, ...] = (
    "Computer Science and Engineering",
    "Information Technology",
    "Electronics and Communication Engineering",
    "Electrical and Electronics Engineering",
    "Mechanical Engineering",
    "Data Science",
    "Artificial Intelligence",
    "Statistics",
    "Mathematics",
    "Computer Applications",
    "Software Engineering",
    "Business Administration",
)

INSTITUTIONS: tuple[str, ...] = (
    "IIT Madras",
    "IIT Bombay",
    "IIT Delhi",
    "IIT Kanpur",
    "IIT Kharagpur",
    "IIT Roorkee",
    "IIT Hyderabad",
    "NIT Trichy",
    "NIT Warangal",
    "NIT Surathkal",
    "NIT Calicut",
    "Anna University",
    "College of Engineering Guindy, Anna University",
    "VIT Vellore",
    "BITS Pilani",
    "BITS Hyderabad",
    "SRM Institute of Science and Technology",
    "PSG College of Technology",
    "Amrita Vishwa Vidyapeetham",
    "IIIT Hyderabad",
    "IIIT Bangalore",
    "Manipal Institute of Technology",
    "Delhi Technological University",
    "Jadavpur University",
    "Cochin University of Science and Technology",
    "PES University",
    "RV College of Engineering",
)

# -------------------------------------------------------------------- contact

EMAIL_DOMAINS: tuple[str, ...] = (
    "gmail.com",
    "outlook.com",
    "yahoo.co.in",
    "hotmail.com",
    "proton.me",
    "icloud.com",
    "rediffmail.com",
)

# -------------------------------------------------------------------- avatars

PORTRAIT_COUNT = 99
_PORTRAIT_FOLDER = {"male": "men", "female": "women"}


def portrait_url(gender: str, index: int) -> str:
    """randomuser.me portrait for ``gender`` ("male" or "female"); ``index`` wraps at 99."""
    try:
        folder = _PORTRAIT_FOLDER[gender]
    except KeyError:
        raise ValueError(f"gender must be 'male' or 'female', got {gender!r}") from None
    return f"https://randomuser.me/api/portraits/{folder}/{index % PORTRAIT_COUNT}.jpg"
