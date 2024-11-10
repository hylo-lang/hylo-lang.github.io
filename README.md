# Hylo website

This repository contains Hylo's website, which you can browse [here](https://hylo-lang.org).

## Infrastructure

The reference is developed as a [Jekyll](https://jekyllrb.com) website,
currently being served by [GitHub Pages](https://pages.github.com).

## Running a local server

### Setting up the environment
To set up the dependencies, you need to have [Ruby]() and the [Bundler](https://bundler.io/) package manager installed (`gem install bundler`). Alternatively, you can also use a devcontainer to set up a VM with all the required dependencies, and have a nicely integrated coding enviroment.

Then, you can run 
```
bundle install
```
to resolve and download the project's dependencies.

You can start the local server by
```
bundle exec jekyll serve -l
```
which makes the site available at http://localhost:4000.
