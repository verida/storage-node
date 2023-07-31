# Do this EXACTLY. 
# If you do "smart" things like adding messages to the merge, main branch ends up ahead of develop
# This is because a comment forces a merge commmit, and we just want to fast-foward. 
# See "MERGING TAG" under https://git-scm.com/docs/git-merge
git checkout develop
git pull
git checkout main
git pull
git merge develop --ff-only 
git push
# switch back to develop branch
git checkout develop
