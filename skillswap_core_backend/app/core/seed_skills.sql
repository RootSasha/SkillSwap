INSERT INTO skills (name) VALUES
    ('Python'), ('JavaScript'), ('TypeScript'), ('Go'), ('Rust'),
    ('React'), ('Vue'), ('Figma'), ('Photoshop'), ('Illustrator'),
    ('Copywriting'), ('SEO'), ('Targeting'), ('SMM'), ('UI/UX Design'),
    ('DevOps'), ('Docker'), ('PostgreSQL'), ('Redis'), ('Machine Learning')
ON CONFLICT (name) DO NOTHING;
