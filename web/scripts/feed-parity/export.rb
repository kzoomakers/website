# Dev-only (see README.md). Run inside the Lobsters container: bin/rails runner export.rb /out
# Writes one JSON file per table the feed ports, rows as the database holds them, so import.mjs can load the same data into Postgres.
require "json"
out = ARGV[0] || "/out"
TABLES = %w[categories tags users usernames domains origins stories story_texts taggings comments comment_stats hats hat_requests hidden_stories saved_stories
  invitations invitation_requests links messages moderations mod_notes notifications keystores votes read_ribbons suggested_taggings suggested_titles tag_filters
  mod_activities mod_mails mod_mail_messages mod_mail_recipients mod_mail_references hotspot_docs hotspot_terms hotspot_term_counts]
conn = ActiveRecord::Base.connection

# fake_data leaves last_comment_at empty and stamps everything within a second, so "newest comment first" is a tie and SQLite breaks it arbitrarily.
# Give stories distinct, deterministic last_comment_at values so ordering differences point at real bugs.
t0 = Time.utc(2026, 1, 1)
Story.where("comments_count > 0").order(:id).each { |s| s.update_columns(last_comment_at: t0 + s.id * 2700) }
TABLES.each do |t|
  cols = conn.columns(t).map(&:name)
  sel = cols.map { |c| (t == "comments" && c == "confidence_order") ? "hex(confidence_order) AS confidence_order" : "\"#{c}\"" }.join(", ")
  rows = conn.select_all("SELECT #{sel} FROM #{t} ORDER BY id").to_a
  File.write("#{out}/#{t}.json", JSON.generate(rows))
  puts "#{t}: #{rows.size}"
end
