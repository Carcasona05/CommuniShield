CREATE DATABASE IF NOT EXISTS communishield_db;
USE communishield_db;

-- =========================
-- 1. USER TABLE
-- =========================
CREATE TABLE User (
    User_Id VARCHAR(20) PRIMARY KEY,
    Fullname VARCHAR(100) NOT NULL,
    Email VARCHAR(100) NOT NULL UNIQUE,
    Phone VARCHAR(20),
    Password VARCHAR(255) NOT NULL,
    Credit_Score DECIMAL(5,2) DEFAULT 0.00,
    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- 2. ADMIN TABLE
-- =========================
CREATE TABLE Admin (
    Admin_Id VARCHAR(20) PRIMARY KEY,
    Fullname VARCHAR(100) NOT NULL,
    Email VARCHAR(100) NOT NULL UNIQUE,
    Phone VARCHAR(20),
    Password VARCHAR(255) NOT NULL,
    Role VARCHAR(30) NOT NULL,
    Department VARCHAR(100),
    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- 3. REPORT TABLE
-- =========================
CREATE TABLE Report (
    Rep_Id VARCHAR(20) PRIMARY KEY,
    SubmittedBy_Id VARCHAR(20) NOT NULL,
    SubmittedBy_Role VARCHAR(30) NOT NULL,

    Incident_Category VARCHAR(100) NOT NULL,
    Incident_Type VARCHAR(100) NOT NULL,
    Details TEXT NOT NULL,
    Photo VARCHAR(255),

    Status VARCHAR(30) DEFAULT 'Pending Review',
    TimeStamp DATETIME DEFAULT CURRENT_TIMESTAMP,

    Verified_By_Admin_Id VARCHAR(20),
    Verification_Remarks TEXT,
    Verified_At DATETIME,

    Is_Deleted BOOLEAN DEFAULT FALSE,
    Deleted_By_Admin_Id VARCHAR(20),
    Deleted_At DATETIME,
    Delete_Reason TEXT,

    FOREIGN KEY (Verified_By_Admin_Id) REFERENCES Admin(Admin_Id),
    FOREIGN KEY (Deleted_By_Admin_Id) REFERENCES Admin(Admin_Id)
);

-- =========================
-- 4. REPORT LOCATION TABLE
-- =========================
CREATE TABLE Report_Location (
    Loc_Id VARCHAR(20) PRIMARY KEY,
    Rep_Id VARCHAR(20) NOT NULL,

    Latitude DECIMAL(10,8),
    Longitude DECIMAL(11,8),
    Address VARCHAR(255),
    Barangay VARCHAR(100),

    Is_Map_Visible BOOLEAN DEFAULT FALSE,
    Mapped_At DATETIME,
    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,
    Updated_At DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (Rep_Id) REFERENCES Report(Rep_Id)
);

-- =========================
-- 5. AI REPORT ANALYSIS TABLE
-- =========================
CREATE TABLE AI_Report_Analysis (
    AI_Analysis_Id VARCHAR(20) PRIMARY KEY,
    Rep_Id VARCHAR(20) NOT NULL,

    Credit_Score DECIMAL(5,2) DEFAULT 0.00,
    Sentiment_Status VARCHAR(50),
    Credibility_Review TEXT,
    Severity_Level VARCHAR(30),

    Analyzed_At DATETIME DEFAULT CURRENT_TIMESTAMP,
    AI_Model_Version VARCHAR(50),

    FOREIGN KEY (Rep_Id) REFERENCES Report(Rep_Id)
);

-- =========================
-- 6. INCIDENT CLUSTER TABLE
-- =========================
CREATE TABLE Incident_Cluster (
    Cluster_Id VARCHAR(20) PRIMARY KEY,

    Cluster_Title VARCHAR(150) NOT NULL,
    Incident_Category VARCHAR(100) NOT NULL,
    Incident_Type VARCHAR(100),

    Barangay VARCHAR(100),
    Center_Latitude DECIMAL(10,8),
    Center_Longitude DECIMAL(11,8),

    Cluster_Status VARCHAR(30) DEFAULT 'Active',
    Report_Count INT DEFAULT 0,
    Priority_Level VARCHAR(30),

    Summary TEXT,

    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,
    Updated_At DATETIME DEFAULT CURRENT_TIMESTAMP,
    Resolved_At DATETIME
);

-- =========================
-- 7. CLUSTER REPORT TABLE
-- =========================
CREATE TABLE Cluster_Report (
    Cluster_Report_Id VARCHAR(20) PRIMARY KEY,

    Cluster_Id VARCHAR(20) NOT NULL,
    Rep_Id VARCHAR(20) NOT NULL,

    Similarity_Score DECIMAL(5,2),
    Added_By VARCHAR(30) DEFAULT 'AI',
    Added_At DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (Cluster_Id) REFERENCES Incident_Cluster(Cluster_Id),
    FOREIGN KEY (Rep_Id) REFERENCES Report(Rep_Id)
);

-- =========================
-- 8. CLUSTER ANALYSIS TABLE
-- =========================
CREATE TABLE Cluster_Analysis (
    Cluster_Analysis_Id VARCHAR(20) PRIMARY KEY,

    Cluster_Id VARCHAR(20) NOT NULL,

    Common_Keywords TEXT,
    Overall_Sentiment VARCHAR(50),
    Average_Credibility_Score DECIMAL(5,2),
    Severity_Level VARCHAR(30),

    Generated_Summary TEXT,
    Recommendation TEXT,

    Analyzed_At DATETIME DEFAULT CURRENT_TIMESTAMP,
    AI_Model_Version VARCHAR(50),

    FOREIGN KEY (Cluster_Id) REFERENCES Incident_Cluster(Cluster_Id)
);

-- =========================
-- 9. GENERATED REPORT TABLE
-- =========================
CREATE TABLE Generated_Report (
    Generated_Report_Id VARCHAR(20) PRIMARY KEY,

    Cluster_Id VARCHAR(20),
    Generated_By_Admin_Id VARCHAR(20) NOT NULL,

    Report_Title VARCHAR(150) NOT NULL,
    Report_Content TEXT NOT NULL,

    Total_Reports_Included INT DEFAULT 0,
    Date_Range_Start DATETIME,
    Date_Range_End DATETIME,

    Generated_At DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (Cluster_Id) REFERENCES Incident_Cluster(Cluster_Id),
    FOREIGN KEY (Generated_By_Admin_Id) REFERENCES Admin(Admin_Id)
);

-- =========================
-- 10. COMMENT TABLE
-- =========================
CREATE TABLE Comment (
    Com_Id VARCHAR(20) PRIMARY KEY,

    Rep_Id VARCHAR(20) NOT NULL,
    Commenter_Id VARCHAR(20) NOT NULL,
    Commenter_Role VARCHAR(30) NOT NULL,

    Details TEXT NOT NULL,
    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (Rep_Id) REFERENCES Report(Rep_Id)
);

-- =========================
-- 11. AUDIT LOG TABLE
-- =========================
CREATE TABLE Audit_Log (
    Log_Id VARCHAR(20) PRIMARY KEY,

    Actor_Admin_Id VARCHAR(20),
    Rep_Id VARCHAR(20),
    Cluster_Id VARCHAR(20),
    Generated_Report_Id VARCHAR(20),

    Action_Type VARCHAR(100) NOT NULL,
    Action_Details TEXT,

    Old_Status VARCHAR(30),
    New_Status VARCHAR(30),
    Old_Value TEXT,
    New_Value TEXT,

    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (Actor_Admin_Id) REFERENCES Admin(Admin_Id),
    FOREIGN KEY (Rep_Id) REFERENCES Report(Rep_Id),
    FOREIGN KEY (Cluster_Id) REFERENCES Incident_Cluster(Cluster_Id),
    FOREIGN KEY (Generated_Report_Id) REFERENCES Generated_Report(Generated_Report_Id)
);

-- =========================
-- 12. NOTIFICATION TABLE
-- =========================
CREATE TABLE Notification (
    Notif_Id VARCHAR(20) PRIMARY KEY,

    Receiver_Id VARCHAR(20) NOT NULL,
    Receiver_Role VARCHAR(30) NOT NULL,

    Sender_Id VARCHAR(20),
    Sender_Role VARCHAR(30) DEFAULT 'System',

    Rep_Id VARCHAR(20),
    Cluster_Id VARCHAR(20),

    Title VARCHAR(150) NOT NULL,
    Message TEXT NOT NULL,
    Notification_Type VARCHAR(50) NOT NULL,

    Is_Read BOOLEAN DEFAULT FALSE,
    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,
    Read_At DATETIME,

    FOREIGN KEY (Rep_Id) REFERENCES Report(Rep_Id),
    FOREIGN KEY (Cluster_Id) REFERENCES Incident_Cluster(Cluster_Id)
);