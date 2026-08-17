-- migration: add email addresses for existing users

-- Update emails for demo users (replace with actual emails as needed)
UPDATE users SET email = 'radhesh@techsec.com' WHERE username = 'Radhesh';
UPDATE users SET email = 'ramesh@techsec.com' WHERE username = 'Ramesh';
UPDATE users SET email = 'raju@pcpl.com' WHERE username = 'Raju';
UPDATE users SET email = 'shubham@techsec.com' WHERE username = 'Shubham';
UPDATE users SET email = 'priya@acme.com' WHERE username = 'Priya';
UPDATE users SET email = 'karan@northwind.com' WHERE username = 'Karan';
UPDATE users SET email = 'anita@blueshield.com' WHERE username = 'Anita';

-- Make email NOT NULL going forward (optional, but good for data integrity)
-- ALTER TABLE users ALTER COLUMN email SET NOT NULL;

INSERT INTO migrations (name, applied_at)
VALUES ('20260817_user_emails', NOW());