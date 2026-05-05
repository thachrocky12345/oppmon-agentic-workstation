# Monorepo Migration — Lumy-Backend + RG-Frontend → ReallyGlobal

Create a new GitHub monorepo called `reallyhq/ReallyGlobal` that combines the
Lumy-Backend and RG-Frontend repos into a single repo with two subfolders:
`backend/` and `frontend/`. The old repos stay live and untouched — this is
additive only.

Steps:

1. Install git-filter-repo if not present: `pip install git-filter-repo`

2. Clone both repos fresh into temp dirs:
   git clone https://github.com/reallyhq/Lumy-Backend /tmp/mono-be
   git clone https://github.com/reallyhq/RG-Frontend /tmp/mono-fe

3. Rewrite each history into its subfolder:
   cd /tmp/mono-be && git filter-repo --to-subdirectory-filter backend/
   cd /tmp/mono-fe && git filter-repo --to-subdirectory-filter frontend/

4. Create the new repo on GitHub:
   export PATH="/c/Program Files/GitHub CLI:$PATH"
   gh repo create reallyhq/ReallyGlobal --private --description "ReallyGlobal monorepo" --confirm

5. Init new local repo, pull in both histories, push:
   mkdir /tmp/ReallyGlobal && cd /tmp/ReallyGlobal
   git init
   git remote add be /tmp/mono-be
   git remote add fe /tmp/mono-fe
   git fetch be --tags
   git fetch fe --tags
   git merge be/main --allow-unrelated-histories -m "chore: import Lumy-Backend history under backend/"
   git merge fe/main --allow-unrelated-histories -m "chore: import RG-Frontend history under frontend/"
   git remote add origin https://github.com/reallyhq/ReallyGlobal.git
   git push -u origin main

6. Copy the docker-compose.yml from C:\Projects\ReallyGlobal\docker-compose.yml
   into the repo root and update the build context paths from
   `./Lumy-Backend` → `./backend` and `./RG-Frontend` → `./frontend`.
   Commit it: "chore: add docker-compose with updated monorepo paths"

7. Copy C:\projects\ReallyGlobal\CLAUDE.md into the repo root.
   Update the mental model diagram: replace `Lumy-Backend/` with `backend/`
   and `RG-Frontend/` with `frontend/`. Commit it.

8. Push and report back: repo URL, commit count per folder, total size.

Constraints:
- Do NOT delete, archive, or touch reallyhq/Lumy-Backend or reallyhq/RG-Frontend
- Do NOT close any open PRs in the old repos
- GitHub CLI path always needs: export PATH="/c/Program Files/GitHub CLI:$PATH"
- Shell is bash (Unix paths, forward slashes)
- Primary local paths: C:\Projects\ReallyGlobal\Lumy-Backend and C:\Projects\ReallyGlobal\RG-Frontend
- git filter-repo rewrites in place — always work on fresh clones, never on the live working trees
