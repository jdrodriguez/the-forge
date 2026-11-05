#!/usr/bin/perl
# protect-main-checkout-parse.pl: decides whether a tool call changes a protected main checkout.
#
# protect-main-checkout.sh pipes the PreToolUse hook input (JSON) to it and acts on what it prints:
#   hatch                        the call mentions or targets the escape-hatch file
#   deny<TAB><root><TAB><what>   the call changes the protected checkout <root>; <what> names the change
# It prints nothing when the call may run, and also when anything goes wrong (bad input, a command it
# cannot parse, an internal error, a run past the alarm), so a broken parser never blocks a session.
#
# Bash commands are lexed and parsed the way bash reads them: quotes, $'...', escapes, comments, heredocs,
# $( ) and backquotes, arithmetic, [[ ]], process substitution, subshells, groups and compound commands.
# The folder and the shell variables are tracked command by command; a subshell, a pipeline element, a
# background job, a substitution or a child shell works on a copy. Functions run when they are called.
# A path that does not resolve (unknown variable, ${...} with an operator, a substitution, a relative
# path while the folder is unknown) is skipped. When a script has a syntax error, the lines before the
# one holding it are still checked, since bash runs each line before it reads the next.
# Work is bounded: stored values, expansions, tokens and evaluations each have a budget, and running
# past one stops the check and lets the call run.
# Env, each one overriding the repo config when set and not empty:
#   CLAUDE_PROTECTED_CHECKOUTS  colon-separated roots (default repoPath; with neither, nothing is protected)
#   CLAUDE_PROTECTED_WORKTREES  colon-separated folders under each root where everything is allowed (default
#                               worktreesDir, else .claude/worktrees)
#   CLAUDE_PROTECTED_WRITABLE   colon-separated folders under each root open to file writes and closed to git
#                               (default fleet.mainCheckoutWritableDirs, else none)
# The repo config is the file AGENT_QUEUE_CONFIG names, else agent-queue.config.json at the repo root, two folders
# above the one that holds this file (fleet/hooks/).
use strict;
use warnings;
no warnings 'recursion';
use Cwd ();

my $HATCH = 'allow-main-checkout-edits';
my $HOME = defined $ENV{HOME} ? $ENV{HOME} : '';
# Nested script strings (bash -c, eval, backquotes, heredoc bodies), and nested commands and
# expansions within one string.
my $MAX_DEPTH = 8;
my $MAX_NEST = 100;
# A longer variable value is not tracked, a longer path cannot be opened, and a longer expansion is
# treated as unknown.
my $MAX_VALUE = 4096;
my $MAX_PATH = 4096;
my $MAX_EXPAND = 1 << 20;
# Per call: tokens lexed, characters read by the trial scans that tell (( and $(( arithmetic from nested
# parentheses, bytes expanded, and evaluations (simple commands, loop passes, function calls and path
# checks). Running past any of them stops the check. Over 30 days of real commands the largest used 413
# tokens, 214 scan characters, 845 evaluations and 21 KB of expansion.
my $MAX_TOKENS = 25_000;
my $MAX_SCAN = 200_000;
my $MAX_BYTES = 8 << 20;
my $MAX_WORK = 5_000;
my ($TOKENS, $SCANNED, $BYTES, $WORK) = (0, 0, 0, 0);
my %CALLING;
my (%PHYS, %ABS);
my %GIT_DENY = map { $_ => 1 } qw(add am apply checkout cherry-pick clean commit merge mv pull rebase reset restore revert rm stash switch);
my %WRAPPER = map { $_ => 1 } qw(command builtin exec nohup env nice time timeout gtimeout);
# Wrapper options that take the next word as their value.
my %WRAPPER_ARG = (
  exec => qr/^-[cl]*a$/,
  env => qr/^-[iv0]*[uP]$/,
  nice => qr/^-n$/,
  time => qr/^-o$/,
  timeout => qr/^-[sk]$/,
  gtimeout => qr/^-[sk]$/,
);
my $REDIR = qr/<<<|<<-|<<|<>|<&|<|>>|>\||>&|>/;
my (@ROOTS, @ROOTS_LC, @WORKTREES_LC, @WRITABLE_LC);
my $VERDICT;

$SIG{ALRM} = sub { exit 0 };
alarm 5;
eval { main(); 1 };
print "$VERDICT\n" if defined $VERDICT;
exit 0;

sub main {
  my $raw = do { local $/; <STDIN> };
  return unless defined $raw && length $raw;
  # JSON::XS ships with macOS's perl and decodes a large Write in about a millisecond; JSON::PP is core.
  my $json = eval { require JSON::XS; JSON::XS->new->utf8 } || do { require JSON::PP; JSON::PP->new->utf8 };
  my $in = $json->decode($raw);
  return unless ref $in eq 'HASH';
  my $tool = text($in->{tool_name});
  return unless defined $tool;
  my $ti = ref $in->{tool_input} eq 'HASH' ? $in->{tool_input} : {};
  my $cwd = text($in->{cwd});
  $cwd = defined $ENV{PWD} && length $ENV{PWD} ? $ENV{PWD} : Cwd::getcwd() unless defined $cwd && length $cwd;
  init_roots($json);
  return unless @ROOTS;

  # The hatch name is matched in any letter case: on macOS's file system every case spelling is the same file.
  if ($tool =~ /^(?:Edit|Write|MultiEdit|NotebookEdit)$/) {
    my $f = text($ti->{file_path});
    $f = text($ti->{notebook_path}) unless defined $f;
    return unless defined $f && length $f;
    block('hatch') if index(lc $f, $HATCH) >= 0;
    return if $f =~ m{^/dev/};
    my $p = phys($f, $cwd);
    my $root = protected_root_of($p);
    block("deny\t$root\t$tool on $p") if defined $root;
    return;
  }
  return unless $tool eq 'Bash';
  my $cmd = text($ti->{command});
  return unless defined $cmd && length $cmd;
  block('hatch') if index(lc $cmd, $HATCH) >= 0;
  my $st = { cwd => phys($cwd, '/'), vars => {}, funcs => {}, depth => 0 };
  $st->{vars}{HOME} = $HOME if length $HOME;
  run_list(parse_script($cmd, 0, 1), $st);
}

# Records the first verdict and unwinds to main.
sub block {
  $VERDICT = $_[0] unless defined $VERDICT;
  die "blocked\n";
}

# A JSON string or number as UTF-8 bytes; undef for null, booleans, arrays and objects.
sub text {
  my ($v) = @_;
  return undef if !defined $v || ref $v;
  my $s = "$v";
  utf8::encode($s);
  return $s;
}

# ---- Paths ----

sub init_roots {
  my ($json) = @_;
  my %env = map { $_ => $ENV{"CLAUDE_PROTECTED_$_"} } qw(CHECKOUTS WORKTREES WRITABLE);
  my $cfg = (grep { !defined $_ || !length $_ } values %env) ? repo_config($json) : {};
  my $root = defined $env{CHECKOUTS} && length $env{CHECKOUTS} ? $env{CHECKOUTS} : text($cfg->{repoPath});
  $root = '' unless defined $root;
  $root = "$HOME/" . substr($root, 2) if $root =~ m{^~/};
  @ROOTS = map { phys($_, '/') } grep { length $_ && m{^/} } split /:/, $root;
  @ROOTS_LC = map { lc } @ROOTS;
  my $wt = defined $env{WORKTREES} && length $env{WORKTREES} ? [split /:/, $env{WORKTREES}] : [text($cfg->{worktreesDir})];
  $wt = ['.claude/worktrees'] unless grep { defined $_ && length $_ } @$wt;
  my $fleet = ref $cfg->{fleet} eq 'HASH' ? $cfg->{fleet} : {};
  my $wr = defined $env{WRITABLE} && length $env{WRITABLE} ? [split /:/, $env{WRITABLE}]
    : ref $fleet->{mainCheckoutWritableDirs} eq 'ARRAY' ? [map { text($_) } @{$fleet->{mainCheckoutWritableDirs}}] : [];
  @WORKTREES_LC = map { lc } grep { defined } map { subdir($_) } @$wt;
  @WRITABLE_LC = map { lc } grep { defined } map { subdir($_) } @$wr;
}

# A folder under a root, as written in the config: relative, with no . or .. component. Undef for anything else.
sub subdir {
  my ($d) = @_;
  return undef unless defined $d;
  my @names = grep { length && $_ ne '.' } split m{/}, $d;
  return undef if !@names || $d =~ m{^/} || grep { $_ eq '..' } @names;
  return join '/', @names;
}

# The repo config, or an empty hash when it is missing or does not parse.
sub repo_config {
  my ($json) = @_;
  my $file = $ENV{AGENT_QUEUE_CONFIG};
  unless (defined $file && length $file) {
    my $self = Cwd::abs_path($0);
    return {} unless defined $self && $self =~ m{^(.*)/[^/]+/[^/]+/[^/]+$};
    $file = "$1/agent-queue.config.json";
  }
  open my $fh, '<', $file or return {};
  my $raw = do { local $/; <$fh> };
  close $fh;
  my $cfg = eval { $json->decode($raw) };
  return ref $cfg eq 'HASH' ? $cfg : {};
}

# Physical path of $p relative to $base, cached for the call since nothing on disk changes during it.
sub phys {
  my ($p, $base) = @_;
  my $key = "$base\0$p";
  $PHYS{$key} = resolve($p, $base) unless exists $PHYS{$key};
  return $PHYS{$key};
}

# The file itself may not exist yet, so the deepest existing folder is resolved and the rest of the path
# is kept as written; an existing file or symlink is resolved all the way. The folders are tried as the
# parent first, then from / down to the first missing one: past a missing folder nothing can exist, even
# through a .. component. A path longer than the kernel accepts is returned as written.
sub resolve {
  my ($p, $base) = @_;
  if ($p =~ m{^/}) { }
  elsif ($p =~ m{^~/}) { $p = "$HOME/" . substr($p, 2) }
  elsif ($p eq '~') { $p = $HOME }
  else { $p = "$base/$p" }
  return $p if length $p > $MAX_PATH || $p !~ m{^/};
  if (-e $p || -l $p) {
    my $r = Cwd::abs_path($p);
    return defined $r ? $r : $p;
  }
  my @names = grep { length } split m{/}, $p;
  my ($dir, $i) = ('/', 0);
  my $parent = '/' . join '/', @names[0 .. $#names - 1];
  if (@names > 1 && -d $parent) {
    ($dir, $i) = ($parent, $#names);
  } else {
    while ($i < @names) {
      my $next = $dir eq '/' ? "/$names[$i]" : "$dir/$names[$i]";
      last unless -d $next;
      ($dir, $i) = ($next, $i + 1);
    }
  }
  unless (exists $ABS{$dir}) {
    my $r = Cwd::abs_path($dir);
    $r = '' unless defined $r;
    $r =~ s{/$}{};
    $ABS{$dir} = $r;
  }
  return join '', $ABS{$dir}, map { "/$_" } @names[$i .. $#names];
}

# The protected root a physical path falls in; undef when the path is allowed. Worktrees are allowed, and
# so are file writes under the writable folders, which the checkout's .gitignore should ignore. Git run from
# inside a writable folder still acts on the checkout itself, so $for_git keeps that folder protected. Letter
# case is ignored, as macOS's file system ignores it.
sub protected_root_of {
  my ($path, $for_git) = @_;
  my $lp = lc "$path/";
  for my $i (0 .. $#ROOTS) {
    my $rp = $ROOTS_LC[$i];
    next if grep { index($lp, "$rp/$_/") == 0 } @WORKTREES_LC;
    next if !$for_git && grep { index($lp, "$rp/$_/") == 0 } @WRITABLE_LC;
    return $ROOTS[$i] if index($lp, "$rp/") == 0;
  }
  return undef;
}

# One unit of evaluation work; past the budget the check stops and the call runs.
sub charge {
  die "budget\n" if ++$WORK > $MAX_WORK;
}

# Blocks when an expanded Bash word names a path in a protected checkout. $mask has one character per
# character of $val: the character itself where it came from unquoted text, \x02 where it was quoted.
# \x01 in $val marks a piece that did not resolve, which skips the check. With $entry the command acts
# on the directory entry itself (rm, a mv source), so a symlink there is not followed: only its folder
# is resolved, unless the path ends in / or a dot component.
sub check_path {
  my ($val, $mask, $st, $verb, $entry) = @_;
  return if !defined $val || $val eq '' || index($val, "\x01") >= 0 || $val =~ m{^/dev/};
  # The kernel refuses a path this long, so nothing can be written through it.
  return if length $val > $MAX_PATH;
  charge();
  my $abs = $val;
  if ($abs !~ m{^/}) {
    return unless defined $st->{cwd};
    $abs = "$st->{cwd}/$abs";
  }
  my $wild = wild_pos($mask);
  return check_wild($abs, $wild + length($abs) - length($val), $verb) if defined $wild;
  my $p;
  if ($entry && $abs !~ m{/\.{0,2}\z}) {
    my $cut = rindex($abs, '/');
    my $dir = phys($cut > 0 ? substr($abs, 0, $cut) : '/', '/');
    $p = ($dir eq '/' ? '' : $dir) . substr($abs, $cut);
  } else {
    $p = phys($abs, '/');
  }
  my $root = protected_root_of($p);
  block("deny\t$root\t$verb $p") if defined $root;
}

# Position of the first unquoted glob or brace character, or undef: a * or ?, or a [ or { with its
# closing ] or } somewhere after it. Each test is one scan of the mask.
sub wild_pos {
  my ($mask) = @_;
  my @at = grep { $_ >= 0 } index($mask, '*'), index($mask, '?');
  for my $pair (['[', ']'], ['{', '}']) {
    my $open = index($mask, $pair->[0]);
    push @at, $open if $open >= 0 && rindex($mask, $pair->[1]) > $open;
  }
  return undef unless @at;
  my ($first) = sort { $a <=> $b } @at;
  return $first;
}

# A glob or brace path: every match lies below the folder in front of the first wild component, so that
# folder is checked in its place. A .. after the wild component could leave it, which skips the check.
sub check_wild {
  my ($abs, $wild, $verb) = @_;
  my $slash = rindex($abs, '/', $wild);
  my $dir = $slash > 0 ? substr($abs, 0, $slash) : '/';
  my $rest = substr($abs, $slash + 1);
  return if grep { $_ eq '..' } split m{/}, $rest;
  my $d = phys($dir, '/');
  my $root = protected_root_of($d);
  block("deny\t$root\t$verb $d/$rest") if defined $root;
}

# ---- Lexer ----
# Tokens: {t => 'w'} word, {t => 'o', v => op} operator or newline, {t => 'r'} redirection,
# {t => 'a'} arithmetic command (( )), {t => 'eof'}.
# A word holds parts: ['l', text, quoted], ['v', name, quoted], ['c', list, quoted] for $( ) and
# backquotes, ['p', list] for <( ) and >( ), and ['x', quoted, parts, names] for an expansion whose value
# is not tracked (${...} with an operator, $(( ))), with its nested parts and the names it may assign.

sub new_ctx {
  my ($s, $depth) = @_;
  die "too deep\n" if $depth > $MAX_DEPTH;
  my $c = { s => $s, depth => $depth, nest => 0, pending => [], peek => undef };
  pos($c->{s}) = 0;
  return $c;
}

sub peek_tok {
  my ($c) = @_;
  $c->{peek} = lex_token($c) unless defined $c->{peek};
  return $c->{peek};
}

sub next_tok {
  my ($c) = @_;
  my $t = peek_tok($c);
  $c->{peek} = undef;
  return $t;
}

sub lex_token {
  my ($c) = @_;
  die "budget\n" if ++$TOKENS > $MAX_TOKENS;
  my $sr = \$c->{s};
  for (;;) {
    $$sr =~ /\G(?:[ \t]+|\\\n)+/gc;
    last unless $$sr =~ /\G#[^\n]*/gc;
  }
  return { t => 'eof' } if pos($$sr) >= length $$sr;
  if ($$sr =~ /\G\n/gc) {
    read_heredocs($c);
    return { t => 'o', v => "\n" };
  }
  return { t => 'o', v => $1 } if $$sr =~ /\G(;;&|;;|;&|;|&&|\|\||\|&|\|)/gc;
  return lex_redir($c, '', $1) if $$sr =~ /\G(&>>?)/gc;
  return { t => 'o', v => '&' } if $$sr =~ /\G&/gc;
  if ($$sr =~ /\G\(\(/gc) {
    my $at = pos($$sr);
    my @pending = @{ $c->{pending} };
    my $a = eval { scan_arith($c) };
    # A budget or nesting stop must end the parse: read as a subshell, $(( 3 > 2 )) would hold a
    # redirect, and every level would be read again.
    die $@ if !$a && ($@ eq "budget\n" || $@ eq "too deep\n");
    return { t => 'a', parts => $a->[0], sets => $a->[1] } if $a;
    pos($$sr) = $at - 1;
    @{ $c->{pending} } = @pending;
    return { t => 'o', v => '(' };
  }
  return { t => 'o', v => $1 } if $$sr =~ /\G([()])/gc;
  return lex_redir($c, '', $1) if $$sr =~ /\G(?![<>]\()($REDIR)/gc;
  my $w = lex_word($c) or die "unexpected character\n";
  # A file descriptor number or {name} written right before a redirection operator.
  return lex_redir($c, $w->{raw}, $1)
    if $w->{raw} =~ /^(?:[0-9]+|\{[A-Za-z_][A-Za-z0-9_]*\})$/ && $$sr =~ /\G(?![<>]\()($REDIR)/gc;
  return $w;
}

sub lex_redir {
  my ($c, $fd, $op) = @_;
  my $sr = \$c->{s};
  $$sr =~ /\G(?:[ \t]+|\\\n)+/gc;
  my $start = pos($$sr);
  my $w = lex_word($c) or die "missing redirection target\n";
  return { t => 'r', fd => $fd, op => $op, w => $w } unless $op eq '<<' || $op eq '<<-';
  my ($delim, $quoted) = heredoc_delim(substr($$sr, $start, pos($$sr) - $start));
  my $hd = { delim => $delim, quoted => $quoted, strip => $op eq '<<-', body => '', parts => [] };
  push @{ $c->{pending} }, $hd;
  return { t => 'r', fd => $fd, op => $op, hd => $hd };
}

# The heredoc terminator after quote removal, with $'...' escapes decoded as bash does, and whether any
# part of it was quoted.
sub heredoc_delim {
  my ($raw) = @_;
  my $quoted = $raw =~ /['"\\]/ ? 1 : 0;
  my $d = '';
  pos($raw) = 0;
  for (;;) {
    if ($raw =~ /\G\$'/gc) { $d .= ansi_decode(\$raw); next }
    if ($raw =~ /\G'([^']*)'/gc) { $d .= $1; next }
    if ($raw =~ /\G\$?"((?:[^"\\]|\\.)*)"/gcs) {
      (my $x = $1) =~ s/\\([\$`"\\])/$1/g;
      $d .= $x;
      next;
    }
    if ($raw =~ /\G\\(.)/gcs) { $d .= $1; next }
    if ($raw =~ /\G(.)/gcs) { $d .= $1; next }
    last;
  }
  return ($d, $quoted);
}

# Reads the bodies of the heredocs started on the line that just ended, in order.
sub read_heredocs {
  my ($c) = @_;
  my $sr = \$c->{s};
  while (my $hd = shift @{ $c->{pending} }) {
    my $body = '';
    for (;;) {
      my $p = pos($$sr);
      last if $p >= length $$sr;
      my $nl = index($$sr, "\n", $p);
      my $line = $nl < 0 ? substr($$sr, $p) : substr($$sr, $p, $nl - $p);
      pos($$sr) = $nl < 0 ? length $$sr : $nl + 1;
      $line =~ s/^\t+// if $hd->{strip};
      last if $line eq $hd->{delim};
      $body .= "$line\n";
    }
    $hd->{body} = $body;
    $hd->{parts} = heredoc_parts($body, $c->{depth}) unless $hd->{quoted};
  }
}

# Parts of an unquoted heredoc body: its text plus the expansions and substitutions bash performs in it.
sub heredoc_parts {
  my ($body, $depth) = @_;
  my $c = new_ctx($body, $depth + 1);
  my $sr = \$c->{s};
  my @parts;
  for (;;) {
    if ($$sr =~ /\G([^\\\$`]+)/gc) { push @parts, ['l', $1, 1]; next }
    next if $$sr =~ /\G\\\n/gc;
    if ($$sr =~ /\G\\([\$`\\])/gc) { push @parts, ['l', $1, 1]; next }
    if ($$sr =~ /\G\\/gc) { push @parts, ['l', '\\', 1]; next }
    if ($$sr =~ /\G\$/gc) { push @parts, lex_dollar($c, 1); next }
    if ($$sr =~ /\G`/gc) { push @parts, lex_backtick($c, 1); next }
    last;
  }
  return \@parts;
}

# Reads one word at the current position; undef when the next character ends a word.
sub lex_word {
  my ($c) = @_;
  my $sr = \$c->{s};
  my $start = pos($$sr);
  my (@parts, $asg);
  # NAME=value, NAME+=value, NAME=( array ) and NAME[index]=value. The name is matched alone and what
  # follows is read with substr: a pattern ending in a fixed = makes perl search the rest of the string
  # for it on every word.
  if ($$sr =~ /\G[A-Za-z_][A-Za-z0-9_]*/gc) {
    my $name = substr($$sr, $start, pos($$sr) - $start);
    my $op = substr($$sr, pos($$sr), 1) eq '=' ? '=' : substr($$sr, pos($$sr), 2) eq '+=' ? '+=' : '';
    if (length $op) {
      pos($$sr) += length $op;
      $asg = [$name, $op, 0];
      push @parts, ['l', "$name$op", 0];
      if ($$sr =~ /\G\(/gc) {
        $asg->[2] = 1;
        push @parts, lex_array($c);
      }
    } elsif ($$sr =~ /\G\[[^\]\s]*/gc && substr($$sr, pos($$sr), 1) eq ']'
      && (substr($$sr, pos($$sr) + 1, 1) eq '=' || substr($$sr, pos($$sr) + 1, 2) eq '+=')) {
      pos($$sr) += substr($$sr, pos($$sr) + 1, 1) eq '=' ? 2 : 3;
      $asg = [$name, '=', 1];
      push @parts, ['l', substr($$sr, $start, pos($$sr) - $start), 0];
    } else {
      pos($$sr) = $start;
    }
  }
  my $vstart = @parts;
  for (;;) {
    if ($$sr =~ /\G([^ \t\n;&|()<>\\'"\$`]+)/gc) { push @parts, ['l', $1, 0]; next }
    next if $$sr =~ /\G\\\n/gc;
    if ($$sr =~ /\G\\(.)/gcs) { push @parts, ['l', $1, 1]; next }
    if ($$sr =~ /\G\\\z/gc) { push @parts, ['l', '\\', 0]; next }
    # A quote is confirmed with substr first: a bare '...' pattern makes perl search the rest of the
    # string for a closing quote at every word end.
    if (substr($$sr, pos($$sr), 1) eq "'") {
      die "unterminated quote\n" unless $$sr =~ /\G'([^']*)'/gc;
      push @parts, ['l', $1, 1];
      next;
    }
    if ($$sr =~ /\G\$'/gc) { push @parts, ['l', ansi_c($c), 1]; next }
    if ($$sr =~ /\G\$?"/gc) { push @parts, lex_dq($c); next }
    if ($$sr =~ /\G\$/gc) { push @parts, lex_dollar($c, 0); next }
    if ($$sr =~ /\G`/gc) { push @parts, lex_backtick($c, 0); next }
    if ($$sr =~ /\G[<>]\(/gc) { push @parts, ['p', parse_nested($c)]; next }
    last;
  }
  return undef unless @parts;
  my $w = { t => 'w', parts => \@parts, raw => substr($$sr, $start, pos($$sr) - $start) };
  $w->{lit} = $parts[0][1] if @parts == 1 && $parts[0][0] eq 'l' && !$parts[0][2];
  if ($asg) {
    $w->{asg} = $asg;
    $w->{vparts} = [@parts[$vstart .. $#parts]];
  }
  return $w;
}

# The elements of NAME=( ... ), up to the closing ). The array's value is not tracked.
sub lex_array {
  my ($c) = @_;
  my $sr = \$c->{s};
  my $part = ['x', 0, [], []];
  for (;;) {
    $$sr =~ /\G(?:[ \t\n]+|\\\n|#[^\n]*)+/gc;
    return $part if $$sr =~ /\G\)/gc;
    my $w = lex_word($c) or die "bad array\n";
    push @{ $part->[2] }, @{ $w->{parts} };
  }
}

# A "..." string after its opening quote.
sub lex_dq {
  my ($c) = @_;
  my $sr = \$c->{s};
  my @parts = (['l', '', 1]);
  for (;;) {
    if ($$sr =~ /\G([^"\\\$`]+)/gc) { push @parts, ['l', $1, 1]; next }
    return @parts if $$sr =~ /\G"/gc;
    next if $$sr =~ /\G\\\n/gc;
    if ($$sr =~ /\G\\([\$`"\\])/gc) { push @parts, ['l', $1, 1]; next }
    if ($$sr =~ /\G\\/gc) { push @parts, ['l', '\\', 1]; next }
    if ($$sr =~ /\G\$/gc) { push @parts, lex_dollar($c, 1); next }
    if ($$sr =~ /\G`/gc) { push @parts, lex_backtick($c, 1); next }
    die "unterminated double quote\n";
  }
}

# A $'...' string after its opening quote, with its escapes decoded.
sub ansi_c {
  my ($c) = @_;
  return ansi_decode(\$c->{s});
}

# Decodes $'...' text from the position in the string $sr points to, through its closing quote.
sub ansi_decode {
  my ($sr) = @_;
  my %esc = (a => "\a", b => "\b", e => "\e", E => "\e", f => "\f", n => "\n", r => "\r", t => "\t", v => "\x0b");
  my $out = '';
  for (;;) {
    if ($$sr =~ /\G([^'\\]+)/gc) { $out .= $1; next }
    return $out if $$sr =~ /\G'/gc;
    if ($$sr =~ /\G\\([abeEfnrtv])/gc) { $out .= $esc{$1}; next }
    if ($$sr =~ /\G\\x([0-9A-Fa-f]{1,2})/gc) { $out .= chr hex $1; next }
    if ($$sr =~ /\G\\([0-7]{1,3})/gc) { $out .= chr(oct($1) & 255); next }
    if ($$sr =~ /\G\\[uU]([0-9A-Fa-f]{1,8})/gc) {
      my $ch = chr hex $1;
      utf8::encode($ch);
      $out .= $ch;
      next;
    }
    if ($$sr =~ /\G\\c(.)/gcs) { $out .= chr(ord($1) & 31); next }
    if ($$sr =~ /\G\\(.)/gcs) { $out .= $1; next }
    die "unterminated \$'\n";
  }
}

# The expansion after a $: substitution, arithmetic, ${...}, a parameter, or a lone $.
sub lex_dollar {
  my ($c, $q) = @_;
  local $c->{nest} = $c->{nest} + 1;
  die "too deep\n" if $c->{nest} > $MAX_NEST;
  die "budget\n" if ++$TOKENS > $MAX_TOKENS;
  my $sr = \$c->{s};
  if ($$sr =~ /\G\(\(/gc) {
    my $at = pos($$sr);
    my @pending = @{ $c->{pending} };
    my $a = eval { scan_arith($c) };
    # A budget or nesting stop must end the parse: read as a subshell, $(( 3 > 2 )) would hold a
    # redirect, and every level would be read again.
    die $@ if !$a && ($@ eq "budget\n" || $@ eq "too deep\n");
    return ['x', $q, $a->[0], $a->[1]] if $a;
    pos($$sr) = $at - 1;
    @{ $c->{pending} } = @pending;
    $c->{peek} = undef;
    return ['c', parse_nested($c), $q];
  }
  return ['c', parse_nested($c), $q] if $$sr =~ /\G\(/gc;
  return lex_param($c, $q) if $$sr =~ /\G\{/gc;
  return ['v', $1, $q] if $$sr =~ /\G([A-Za-z_][A-Za-z0-9_]*|[0-9]|[\@*#?\$!\-])/gc;
  return ['l', '$', $q];
}

# A ${...} expansion after its opening brace. ${NAME} is a plain parameter; any other form keeps its
# nested parts so their substitutions still run, and ${NAME:=word} or ${NAME=word} may assign NAME.
sub lex_param {
  my ($c, $q) = @_;
  my $sr = \$c->{s};
  my $at = pos($$sr);
  # The name is matched alone and the closing } checked with substr, for the same reason as in lex_word.
  if ($$sr =~ /\G(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[\@*#?\$!\-])/gc && substr($$sr, pos($$sr), 1) eq '}') {
    my $name = substr($$sr, $at, pos($$sr) - $at);
    pos($$sr) += 1;
    return ['v', $name, $q];
  }
  pos($$sr) = $at;
  my (@sets, @parts);
  push @sets, $1 if $$sr =~ /\G([A-Za-z_][A-Za-z0-9_]*)(?=:?=)/gc;
  for (;;) {
    next if $$sr =~ /\G[^}\\'"\$`]+/gc;
    return ['x', $q, \@parts, \@sets] if $$sr =~ /\G\}/gc;
    next if $$sr =~ /\G\\./gcs;
    next if substr($$sr, pos($$sr), 1) eq "'" && $$sr =~ /\G'[^']*'/gc;
    if ($$sr =~ /\G"/gc) { push @parts, lex_dq($c); next }
    if ($$sr =~ /\G\$/gc) { push @parts, lex_dollar($c, 1); next }
    if ($$sr =~ /\G`/gc) { push @parts, lex_backtick($c, 1); next }
    die "unterminated \${\n";
  }
}

# An arithmetic body after (( or $(( up to the closing )). Returns [parts, assigned names], or undef
# with the position restored when the parentheses do not close as )), which makes the text a subshell
# or a command substitution instead.
sub scan_arith {
  my ($c) = @_;
  my $sr = \$c->{s};
  my $start = pos($$sr);
  my ($depth, $text, $result, @parts) = (0, '');
  for (;;) {
    # Nested parentheses send a trial scan from every level, so the characters read are budgeted.
    die "budget\n" if $SCANNED + pos($$sr) - $start > $MAX_SCAN;
    if ($$sr =~ /\G([^()\$`"'\\]+)/gc) { $text .= $1; next }
    if ($$sr =~ /\G\(/gc) { $depth++; $text .= '('; next }
    if ($$sr =~ /\G\)/gc) {
      if ($depth) { $depth--; $text .= ')'; next }
      $result = [\@parts, arith_sets($text)] if $$sr =~ /\G\)/gc;
      last;
    }
    if ($$sr =~ /\G\$/gc) { push @parts, lex_dollar($c, 1); $text .= ' 0 '; next }
    if ($$sr =~ /\G`/gc) { push @parts, lex_backtick($c, 1); $text .= ' 0 '; next }
    if ($$sr =~ /\G"/gc) { push @parts, lex_dq($c); $text .= ' 0 '; next }
    if (substr($$sr, pos($$sr), 1) eq "'" && $$sr =~ /\G'([^']*)'/gc) { $text .= $1; next }
    if ($$sr =~ /\G\\(.)/gcs) { $text .= $1; next }
    last;
  }
  $SCANNED += pos($$sr) - $start;
  pos($$sr) = $start unless $result;
  return $result;
}

# Names an arithmetic expression assigns: x = 1, x += 1, x++, --x. The text is split into tokens in one
# pass and each name is paired with the operator next to it.
sub arith_sets {
  my ($t) = @_;
  my @tok = $t =~ /([A-Za-z_][A-Za-z0-9_]*|<<=|>>=|\+\+|--|[-+*\/%&|^]=|==|!=|<=|>=|=|[^\sA-Za-z_])/g;
  my @names;
  for my $i (0 .. $#tok) {
    next unless $tok[$i] =~ /^[A-Za-z_]/;
    my ($before, $after) = ($i > 0 ? $tok[$i - 1] : '', $i < $#tok ? $tok[$i + 1] : '');
    push @names, $tok[$i] if $after =~ /^(?:=|<<=|>>=|[-+*\/%&|^]=|\+\+|--)$/ || $before =~ /^(?:\+\+|--)$/;
  }
  return \@names;
}

# A `...` substitution after its opening backquote; the body is parsed as its own script.
sub lex_backtick {
  my ($c, $q) = @_;
  my $sr = \$c->{s};
  my $body = '';
  for (;;) {
    if ($$sr =~ /\G([^`\\]+)/gc) { $body .= $1; next }
    last if $$sr =~ /\G`/gc;
    if ($$sr =~ /\G\\([\$`\\])/gc) { $body .= $1; next }
    if ($q && $$sr =~ /\G\\"/gc) { $body .= '"'; next }
    if ($$sr =~ /\G\\(.)/gcs) { $body .= "\\$1"; next }
    die "unterminated backquote\n";
  }
  return ['c', parse_script($body, $c->{depth} + 1), $q];
}

# Reads a [[ ... ]] test up to its closing ]]. Inside it < > ( ) && || belong to the test, so nothing is
# a redirection or a subshell. Returns the parts whose substitutions run.
sub lex_cond {
  my ($c) = @_;
  my $sr = \$c->{s};
  my @parts;
  for (;;) {
    $$sr =~ /\G(?:[ \t\n]+|\\\n)+/gc;
    die "unterminated [[\n" if pos($$sr) >= length $$sr;
    return \@parts if $$sr =~ /\G\]\](?=[ \t\n;&|()<>]|\z)/gc;
    next if $$sr =~ /\G[()<>!|&;]+/gc;
    my $w = lex_word($c) or die "bad [[\n";
    push @parts, @{ $w->{parts} };
  }
}

# ---- Parser ----
# Nodes: {k => 'cmd', asg, words, redirs}, {k => 'sub', list, redirs} for ( ), {k => 'group', words, sets,
# lists, redirs, loop} for { } and the compound commands (loop names a for variable with an in list),
# {k => 'func', body}, {k => 'arith' or 'cond', parts}.

# With $partial, a script that fails to parse still returns the commands on the lines before the one
# holding the error, since bash runs each line before it reads the next.
sub parse_script {
  my ($s, $depth, $partial) = @_;
  my $c = new_ctx($s, $depth);
  $c->{lines} = [];
  $c->{done} = 0;
  my $ok = eval {
    parse_list($c, {}, $c->{lines});
    die "unexpected token\n" unless next_tok($c)->{t} eq 'eof';
    1;
  };
  return $c->{lines} if $ok;
  die $@ unless $partial;
  return [@{ $c->{lines} }[0 .. $c->{done} - 1]];
}

# Parses a command list up to the ) that closes a $( ), <( ) or >( ) opened just before.
sub parse_nested {
  my ($c) = @_;
  my $list = parse_list($c, { ')' => 1 });
  expect_op($c, ')');
  return $list;
}

# Commands up to the end or a stop token (an operator, or a reserved word at a command start). Commands
# joined by && or || are checked in order whatever the outcome; a list ended by & runs in the background
# and so in a subshell. $top is the script's own list: each newline there marks the commands before it
# as complete lines.
sub parse_list {
  my ($c, $stop, $top) = @_;
  my $nodes = $top || [];
  my $start = @$nodes;
  for (;;) {
    my $t = peek_tok($c);
    last if $t->{t} eq 'eof';
    if ($t->{t} eq 'o') {
      my $v = $t->{v};
      last if $stop->{$v};
      if ($v eq ';' || $v eq '&' || $v eq "\n") {
        next_tok($c);
        if ($v eq '&' && @$nodes > $start) {
          my @job = splice @$nodes, $start;
          push @$nodes, { k => 'sub', list => \@job, redirs => [] };
        }
        $start = @$nodes;
        $c->{done} = $start if $top && $v eq "\n";
        next;
      }
      if ($v eq '&&' || $v eq '||') {
        next_tok($c);
        skip_newlines($c);
        next;
      }
      die "unexpected $v\n" unless $v eq '(';
    }
    last if $t->{t} eq 'w' && defined $t->{lit} && $stop->{ $t->{lit} };
    push @$nodes, parse_pipeline($c);
  }
  return $nodes;
}

# Commands joined by | or |&. In bash each element of a pipeline runs in a subshell.
sub parse_pipeline {
  my ($c) = @_;
  my @cmds = (parse_command($c));
  for (;;) {
    my $t = peek_tok($c);
    last unless $t->{t} eq 'o' && ($t->{v} eq '|' || $t->{v} eq '|&');
    next_tok($c);
    skip_newlines($c);
    push @cmds, parse_command($c);
  }
  return @cmds == 1 ? $cmds[0] : { k => 'pipe', cmds => \@cmds, redirs => [] };
}

sub parse_command {
  my ($c) = @_;
  local $c->{nest} = $c->{nest} + 1;
  die "too deep\n" if $c->{nest} > $MAX_NEST;
  my $t = peek_tok($c);
  if ($t->{t} eq 'o' && $t->{v} eq '(') {
    next_tok($c);
    my $list = parse_list($c, { ')' => 1 });
    expect_op($c, ')');
    return { k => 'sub', list => $list, redirs => parse_redirs($c) };
  }
  if ($t->{t} eq 'a') {
    next_tok($c);
    return { k => 'arith', parts => $t->{parts}, sets => $t->{sets}, redirs => parse_redirs($c) };
  }
  my $kw = $t->{t} eq 'w' ? $t->{lit} : undef;
  return parse_simple($c) unless defined $kw;
  if ($kw eq '{') {
    next_tok($c);
    my $list = parse_list($c, { '}' => 1 });
    expect_word($c, '}');
    return group([], [], [$list], parse_redirs($c));
  }
  if ($kw eq '!' || $kw eq 'time' || $kw eq 'coproc') {
    next_tok($c);
    next_tok($c) if $kw eq 'time' && is_word(peek_tok($c), '-p');
    return parse_command($c);
  }
  if ($kw eq 'if') {
    next_tok($c);
    my @lists;
    for (;;) {
      push @lists, parse_list($c, { then => 1 });
      expect_word($c, 'then');
      push @lists, parse_list($c, { elif => 1, else => 1, fi => 1 });
      my $end = next_tok($c);
      next if is_word($end, 'elif');
      if (is_word($end, 'else')) {
        push @lists, parse_list($c, { fi => 1 });
        expect_word($c, 'fi');
        last;
      }
      last if is_word($end, 'fi');
      die "bad if\n";
    }
    return group([], [], \@lists, parse_redirs($c));
  }
  if ($kw eq 'while' || $kw eq 'until') {
    next_tok($c);
    my $cond = parse_list($c, { do => 1 });
    expect_word($c, 'do');
    my $body = parse_list($c, { done => 1 });
    expect_word($c, 'done');
    return group([], [], [$cond, $body], parse_redirs($c));
  }
  if ($kw eq 'for' || $kw eq 'select') {
    next_tok($c);
    my (@words, @sets, $loop);
    my $head = next_tok($c);
    if ($head->{t} eq 'a') {
      push @words, $head;
      push @sets, @{ $head->{sets} };
    } elsif ($head->{t} eq 'w' && defined $head->{lit}) {
      push @sets, $head->{lit};
      skip_newlines($c);
      if (is_word(peek_tok($c), 'in')) {
        next_tok($c);
        $loop = $head->{lit} if $kw eq 'for';
        push @words, next_tok($c) while peek_tok($c)->{t} eq 'w';
      }
    } else {
      die "bad for\n";
    }
    my $sep = peek_tok($c);
    next_tok($c) if $sep->{t} eq 'o' && $sep->{v} eq ';';
    skip_newlines($c);
    my $open = next_tok($c);
    my $close = is_word($open, 'do') ? 'done' : is_word($open, '{') ? '}' : die "bad for\n";
    my $body = parse_list($c, { $close => 1 });
    expect_word($c, $close);
    my $node = group(\@words, \@sets, [$body], parse_redirs($c));
    $node->{loop} = $loop if defined $loop;
    return $node;
  }
  if ($kw eq 'case') {
    next_tok($c);
    my $subject = next_tok($c);
    die "bad case\n" unless $subject->{t} eq 'w';
    my @words = ($subject);
    my @lists;
    skip_newlines($c);
    expect_word($c, 'in');
    for (;;) {
      skip_newlines($c);
      my $p = peek_tok($c);
      if (is_word($p, 'esac')) { next_tok($c); last }
      next_tok($c) if $p->{t} eq 'o' && $p->{v} eq '(';
      for (;;) {
        my $pat = next_tok($c);
        die "bad case pattern\n" unless $pat->{t} eq 'w';
        push @words, $pat;
        my $sep = next_tok($c);
        last if $sep->{t} eq 'o' && $sep->{v} eq ')';
        die "bad case pattern\n" unless $sep->{t} eq 'o' && $sep->{v} eq '|';
      }
      push @lists, parse_list($c, { ';;' => 1, ';&' => 1, ';;&' => 1, esac => 1 });
      my $end = peek_tok($c);
      next_tok($c) if $end->{t} eq 'o' && $end->{v} =~ /^(?:;;|;&|;;&)$/;
    }
    return group(\@words, [], \@lists, parse_redirs($c));
  }
  if ($kw eq '[[') {
    next_tok($c);
    return { k => 'cond', parts => lex_cond($c), sets => [], redirs => parse_redirs($c) };
  }
  if ($kw eq 'function') {
    next_tok($c);
    my $name = next_tok($c);
    die "bad function\n" unless $name->{t} eq 'w';
    my $p = peek_tok($c);
    if ($p->{t} eq 'o' && $p->{v} eq '(') {
      next_tok($c);
      expect_op($c, ')');
    }
    skip_newlines($c);
    return { k => 'func', name => $name->{lit}, body => parse_command($c), redirs => [] };
  }
  return parse_simple($c);
}

sub group {
  my ($words, $sets, $lists, $redirs) = @_;
  return { k => 'group', words => $words, sets => $sets, lists => $lists, redirs => $redirs };
}

# Assignments, words and redirections up to an operator; NAME ( ) starts a function definition.
sub parse_simple {
  my ($c) = @_;
  my (@asg, @words, @redirs);
  for (;;) {
    my $t = peek_tok($c);
    if ($t->{t} eq 'r') { push @redirs, next_tok($c); next }
    last unless $t->{t} eq 'w';
    next_tok($c);
    if (!@words && $t->{asg}) { push @asg, $t; next }
    push @words, $t;
    next unless @words == 1 && !@asg && !@redirs;
    my $p = peek_tok($c);
    next unless $p->{t} eq 'o' && $p->{v} eq '(';
    next_tok($c);
    expect_op($c, ')');
    skip_newlines($c);
    return { k => 'func', name => $t->{lit}, body => parse_command($c), redirs => [] };
  }
  return { k => 'cmd', asg => \@asg, words => \@words, redirs => \@redirs };
}

sub parse_redirs {
  my ($c) = @_;
  my @redirs;
  push @redirs, next_tok($c) while peek_tok($c)->{t} eq 'r';
  return \@redirs;
}

sub is_word {
  my ($t, $v) = @_;
  return $t->{t} eq 'w' && defined $t->{lit} && $t->{lit} eq $v;
}

sub expect_op {
  my ($c, $v) = @_;
  my $t = next_tok($c);
  die "expected $v\n" unless $t->{t} eq 'o' && $t->{v} eq $v;
}

sub expect_word {
  my ($c, $v) = @_;
  die "expected $v\n" unless is_word(next_tok($c), $v);
}

sub skip_newlines {
  my ($c) = @_;
  for (;;) {
    my $t = peek_tok($c);
    last unless $t->{t} eq 'o' && $t->{v} eq "\n";
    next_tok($c);
  }
}

# ---- Evaluation ----
# State: cwd (physical path, undef when unknown), vars (name => value for the values known), depth.

# A copy of the state for a subshell. Functions come along; a child shell gets none, since bash passes
# a function to a child only after export -f.
sub clone_state {
  my ($st, $child) = @_;
  return {
    cwd => $st->{cwd},
    vars => { %{ $st->{vars} } },
    funcs => $child ? {} : { %{ $st->{funcs} } },
    depth => $st->{depth},
  };
}

sub run_list {
  my ($list, $st) = @_;
  run_node($_, $st) for @$list;
}

sub run_node {
  my ($n, $st) = @_;
  my $k = $n->{k};
  return run_cmd($n, $st) if $k eq 'cmd';
  # A definition only records the body; it runs when the function is called.
  if ($k eq 'func') {
    $st->{funcs}{ $n->{name} } = $n->{body} if defined $n->{name};
    return;
  }
  if ($k eq 'pipe') {
    run_node($_, clone_state($st)) for @{ $n->{cmds} };
    return;
  }
  # Redirections of a compound command are opened before its body runs.
  run_redirs($n->{redirs}, $st);
  if ($k eq 'sub') { run_list($n->{list}, clone_state($st)) }
  elsif ($k eq 'arith' || $k eq 'cond') {
    run_parts($n->{parts}, $st);
    forget($st, @{ $n->{sets} });
  } else {
    run_parts($_->{parts}, $st) for @{ $n->{words} };
    my $values = loop_values($n, $st);
    forget($st, @{ $n->{sets} });
    if (!$values) {
      run_list($_, $st) for @{ $n->{lists} };
      return;
    }
    for my $v (@$values) {
      charge();
      set_var($st, $n->{loop}, $v);
      run_list($_, $st) for @{ $n->{lists} };
    }
  }
}

# Runs a function's body in the calling shell. A function already running is not entered again.
sub call_function {
  my ($st, $name) = @_;
  return if $CALLING{$name};
  charge();
  local $CALLING{$name} = 1;
  run_node($st->{funcs}{$name}, $st);
}

# The values a for loop's body runs with, when every word of its list resolves to exactly one word and
# the list is short; undef otherwise, which leaves the loop variable unknown for a single pass.
sub loop_values {
  my ($n, $st) = @_;
  return undef unless defined $n->{loop} && @{ $n->{words} } <= 32;
  my @values;
  for my $w (@{ $n->{words} }) {
    my ($v, $m) = expand($w->{parts}, $st, 1);
    return undef if $v eq '' || index($v, "\x01") >= 0 || defined wild_pos($m);
    push @values, $v;
  }
  return \@values;
}

# Runs the substitutions in a word's parts and applies the assignments its expansions make.
sub run_parts {
  my ($parts, $st) = @_;
  for my $p (@$parts) {
    if ($p->[0] eq 'c' || $p->[0] eq 'p') { run_list($p->[1], clone_state($st)) }
    elsif ($p->[0] eq 'x') {
      run_parts($p->[2], $st);
      forget($st, @{ $p->[3] });
    }
  }
}

sub run_cmd {
  my ($n, $st) = @_;
  charge();
  if (!@{ $n->{words} }) {
    run_redirs($n->{redirs}, $st);
    for my $a (@{ $n->{asg} }) {
      run_parts($a->{vparts}, $st);
      assign($st, $a);
    }
    return;
  }
  run_parts($_->{parts}, $st) for @{ $n->{words} };
  run_redirs($n->{redirs}, $st);
  # Prefix assignments last for this command only; they reach git and child shells through the env.
  my %env;
  for my $a (@{ $n->{asg} }) {
    run_parts($a->{vparts}, $st);
    my ($name, $op, $kind) = @{ $a->{asg} };
    $env{$name} = $kind || $op ne '=' ? "\x01" : (expand($a->{vparts}, $st, 0))[0];
  }
  analyze($st, $n, [@{ $n->{words} }], \%env);
}

sub run_redirs {
  my ($redirs, $st) = @_;
  for my $r (@$redirs) {
    if ($r->{hd}) {
      run_parts($r->{hd}{parts}, $st);
      next;
    }
    run_parts($r->{w}{parts}, $st);
    next unless $r->{op} =~ /^(?:>|>>|>\||&>|&>>|<>|>&)$/;
    my ($val, $mask) = expand($r->{w}{parts}, $st, 1);
    # >&2, >&- and >&2- duplicate or close a descriptor; >&word with any other word is a file.
    next if $r->{op} eq '>&' && $val =~ /^(?:[0-9]+-?|-)$/;
    check_path($val, $mask, $st, 'writing');
  }
}

# Value and mask of a word's parts. Unresolved pieces become \x01. With $split, an unquoted variable
# whose value holds blanks counts as unresolved, since bash would split it into several words. An
# expansion past $MAX_EXPAND is unresolved, and the bytes expanded in one call share $MAX_BYTES.
sub expand {
  my ($parts, $st, $split) = @_;
  my ($val, $mask) = ('', '');
  for my $i (0 .. $#$parts) {
    if (length $val > $MAX_EXPAND) {
      ($val, $mask) = ("\x01", "\x02");
      last;
    }
    my ($t, $a, $b) = @{ $parts->[$i] };
    if ($t eq 'l') {
      if ($i == 0 && !$b && substr($a, 0, 1) eq '~') {
        # Tilde prefix: ~ alone or ~/ is HOME; ~user, ~+ and ~- are not tracked.
        my $slash = index($a, '/');
        my $pre = $slash < 0 ? $a : substr($a, 0, $slash);
        my $home = $pre eq '~' && ($slash >= 0 || $#$parts == 0) ? lookup($st, 'HOME') : undef;
        $home = "\x01" unless defined $home;
        $val .= $home;
        $mask .= "\x02" x length $home;
        $a = substr($a, length $pre);
      }
      $val .= $a;
      $mask .= $b ? "\x02" x length $a : $a;
    } elsif ($t eq 'v') {
      my $v = lookup($st, $a);
      $v = "\x01" if !defined $v || ($split && !$b && $v =~ /[ \t\n]/);
      $val .= $v;
      if ($b) { $mask .= "\x02" x length $v }
      else {
        (my $m = $v) =~ tr/{},/\x02\x02\x02/;
        $mask .= $m;
      }
    } else {
      $val .= "\x01";
      $mask .= "\x02";
    }
  }
  $BYTES += length $val;
  die "budget\n" if $BYTES > $MAX_BYTES;
  return ($val, $mask);
}

sub value {
  my ($w, $st) = @_;
  return (expand($w->{parts}, $st, 1))[0];
}

sub lookup {
  my ($st, $name) = @_;
  return $st->{cwd} if $name eq 'PWD';
  return $st->{vars}{$name};
}

# Records a known value; an unknown one, or one longer than $MAX_VALUE, leaves the variable unknown.
sub set_var {
  my ($st, $name, $v) = @_;
  return if $name eq 'PWD' || $name eq '_';
  if (!defined $v || index($v, "\x01") >= 0 || length $v > $MAX_VALUE) { delete $st->{vars}{$name} }
  else { $st->{vars}{$name} = $v }
}

sub forget {
  my ($st, @names) = @_;
  delete $st->{vars}{$_} for @names;
}

sub assign {
  my ($st, $a) = @_;
  my ($name, $op, $kind) = @{ $a->{asg} };
  return forget($st, $name) if $kind;
  my $v = (expand($a->{vparts}, $st, 0))[0];
  if ($op eq '+=') {
    my $old = lookup($st, $name);
    $v = defined $old ? $old . $v : "\x01";
  }
  set_var($st, $name, $v);
}

sub set_cwd {
  my ($st, $v) = @_;
  if (!defined $v || index($v, "\x01") >= 0 || length $v > $MAX_PATH) {
    $st->{cwd} = undef;
    return;
  }
  if ($v !~ m{^/}) {
    return unless defined $st->{cwd};
    $v = "$st->{cwd}/$v";
  }
  $st->{cwd} = phys($v, '/');
}

# The command a simple command runs, after wrappers such as env or command, and what it does. A name
# defined as a function runs that function; a wrapper always runs a program instead.
sub analyze {
  my ($st, $n, $w, $env) = @_;
  return unless @$w;
  my $name = value($w->[0], $st);
  return call_function($st, $name) if exists $st->{funcs}{$name};
  for (;;) {
    return unless @$w;
    $name = value($w->[0], $st);
    return if $name eq '' || index($name, "\x01") >= 0;
    my $slash = rindex($name, '/');
    $name = substr($name, $slash + 1) if $slash >= 0;
    last unless $WRAPPER{$name};
    shift @$w;
    # A command run through a separate program cannot change this shell's folder or variables.
    $st = clone_state($st) unless $name eq 'command' || $name eq 'builtin';
    while (@$w) {
      my $o = value($w->[0], $st);
      if ($name eq 'env' && $w->[0]{asg} && $o !~ /^-/) {
        my $a = shift @$w;
        my ($var, $op, $kind) = @{ $a->{asg} };
        $env->{$var} = $kind || $op ne '=' ? "\x01" : (expand($a->{vparts}, $st, 0))[0];
        next;
      }
      last unless $o =~ /^-./ && $name ne 'nohup' && $name ne 'builtin';
      shift @$w;
      last if $o eq '--';
      return if $name eq 'command' && $o =~ /[vV]/;
      return if $name eq 'env' && $o =~ /^(?:-S|--split-string)/;
      if ($name eq 'env' && ($o eq '-C' || $o =~ /^--chdir=/)) {
        my $d = $o eq '-C' ? (@$w ? value(shift @$w, $st) : return) : substr($o, 8);
        set_cwd($st, $d);
        next;
      }
      shift @$w if $WRAPPER_ARG{$name} && $o =~ $WRAPPER_ARG{$name};
    }
    shift @$w if $name eq 'timeout' || $name eq 'gtimeout';
  }
  if ($name eq 'cd') { return do_cd($st, $w, 0) }
  if ($name eq 'pushd') { return do_cd($st, $w, 1) }
  if ($name eq 'popd') { $st->{cwd} = undef; return }
  if ($name eq 'git') { return do_git($st, $w, $env) }
  if ($name eq 'tee') { return do_tee($st, $w) }
  if ($name eq 'sed' || $name eq 'gsed') { return do_sed($st, $w) }
  if ($name =~ /^g?(cp|mv)$/) { return do_cpmv($st, $w, $1 eq 'mv') }
  if ($name eq 'rm' || $name eq 'grm') { return do_rm($st, $w) }
  if ($name eq 'touch' || $name eq 'gtouch') { return do_touch($st, $w) }
  if ($name =~ /^(?:bash|sh|zsh|dash|ksh)$/) { return do_shell($st, $n, $w, $env) }
  if ($name eq 'eval') { return do_eval($st, $w) }
  if ($name =~ /^(?:export|declare|typeset|local|readonly)$/) { return do_declare($st, $w) }
  my @args = map { value($_, $st) } @$w[1 .. $#$w];
  my @names = grep { /^[A-Za-z_][A-Za-z0-9_]*$/ } @args;
  if ($name eq 'read') { forget($st, 'REPLY', @names) }
  elsif ($name eq 'unset' && grep { $_ eq '-f' } @args) { delete @{ $st->{funcs} }{@names} }
  elsif ($name eq 'unset' || $name eq 'mapfile' || $name eq 'readarray') { forget($st, 'MAPFILE', @names) }
  elsif ($name eq 'getopts') { forget($st, 'OPTARG', 'OPTIND', @names) }
  elsif ($name eq 'let') { forget($st, map { @{ arith_sets($_) } } @args) }
  elsif ($name eq 'printf') {
    for my $i (0 .. $#args - 1) { forget($st, $args[$i + 1]) if $args[$i] eq '-v' }
  }
}

# cd and pushd: the folder becomes the target, HOME without one, unknown when the target does not
# resolve (unknown variable, $_, -, a substitution, a glob) and for pushd's stack forms.
sub do_cd {
  my ($st, $w, $pushd) = @_;
  my @a = @$w[1 .. $#$w];
  while (@a) {
    my $o = value($a[0], $st);
    last if $o eq '-' || $o !~ /^-/;
    shift @a;
    last if $o eq '--';
    return if $pushd && $o eq '-n';
    next if $o =~ /^-[LPe@]+$/;
    return $st->{cwd} = undef if $pushd;
    return;
  }
  if (!@a) {
    return $st->{cwd} = undef if $pushd;
    return set_cwd($st, lookup($st, 'HOME'));
  }
  return $st->{cwd} = undef if @a > 1;
  my ($v, $m) = expand($a[0]{parts}, $st, 1);
  return $st->{cwd} = undef if $v eq '-' || defined wild_pos($m) || ($pushd && $v =~ /^[-+][0-9]+$/);
  # cd "" fails and leaves the folder alone.
  return if $v eq '';
  set_cwd($st, $v);
}

sub do_git {
  my ($st, $w, $env) = @_;
  my @a = @$w[1 .. $#$w];
  my (@cdirs, $sub);
  # GIT_DIR and GIT_WORK_TREE from a prefix assignment, else from an earlier assignment or export.
  my ($gitdir, $worktree) = map { exists $env->{$_} ? $env->{$_} : $st->{vars}{$_} } qw(GIT_DIR GIT_WORK_TREE);
  while (@a) {
    my $o = value(shift @a, $st);
    return if $o eq '--help' || $o eq '-h' || $o eq '--version' || $o eq '-v';
    if ($o eq '-C') {
      return unless @a;
      push @cdirs, value(shift @a, $st);
      next;
    }
    if ($o =~ /^--(git-dir|work-tree)(?:=(.*))?$/s) {
      my ($which, $inline) = ($1, $2);
      my $v = defined $inline ? $inline : @a ? value(shift @a, $st) : return;
      if ($which eq 'git-dir') { $gitdir = $v } else { $worktree = $v }
      next;
    }
    if ($o eq '-c' || $o eq '--namespace' || $o eq '--config-env') {
      shift @a;
      next;
    }
    next if $o =~ /^-/;
    $sub = $o;
    last;
  }
  return unless defined $sub && $GIT_DENY{$sub};
  return if read_only_git($sub, [map { value($_, $st) } @a]);
  # The folder git runs in: the shell's folder, then each -C in turn.
  my $base = $st->{cwd};
  for my $d (@cdirs) {
    next if $d eq '';
    if (index($d, "\x01") >= 0) { $base = undef; last }
    $base = $d =~ m{^/} ? $d : defined $base ? "$base/$d" : undef;
  }
  my @targets;
  for my $t ($worktree, $gitdir) {
    next unless defined $t;
    push @targets, $t =~ m{^/} ? $t : defined $base ? "$base/$t" : undef;
  }
  push @targets, $base unless defined $worktree && defined $gitdir;
  for my $t (@targets) {
    next unless defined $t && index($t, "\x01") < 0 && length $t <= $MAX_PATH;
    charge();
    my $p = phys($t, '/');
    my $root = protected_root_of($p, 1);
    block("deny\t$root\tgit $sub in $p") if defined $root;
  }
}

# Forms of the blocked subcommands that change nothing: --help or -h; merge and pull with --ff-only;
# stash list and show; commit --dry-run; add, mv and rm with -n or --dry-run; clean with -n or
# --dry-run; and apply's --check, --stat, --numstat and --summary unless --index, --cached, --3way or
# --apply makes it apply as well. Options end at --.
sub read_only_git {
  my ($sub, $rest) = @_;
  my @opts;
  for my $o (@$rest) {
    last if $o eq '--';
    push @opts, $o if $o =~ /^-/;
  }
  my %has = map { $_ => 1 } @opts;
  # Single-letter options written together, such as -nd.
  my @short = map { /^-([A-Za-z]+)$/ ? $1 : () } @opts;
  return 1 if $has{'--help'} || $has{'-h'};
  return 1 if ($sub eq 'merge' || $sub eq 'pull') && $has{'--ff-only'};
  return 1 if $sub eq 'stash' && @$rest && ($rest->[0] eq 'list' || $rest->[0] eq 'show');
  return 1 if $sub eq 'commit' && $has{'--dry-run'};
  return 1 if ($sub eq 'add' || $sub eq 'mv' || $sub eq 'rm') && ($has{'--dry-run'} || grep { /n/ } @short);
  if ($sub eq 'clean') {
    return 1 if $has{'--dry-run'};
    # In a group such as -dne, the letters after e are its pattern.
    for my $group (@short) {
      for my $ch (split //, $group) {
        return 1 if $ch eq 'n';
        last if $ch eq 'e';
      }
    }
  }
  if ($sub eq 'apply') {
    return 0 if grep { $has{$_} } qw(--index --cached --3way -3 --apply);
    return 1 if grep { $has{$_} } qw(--check --stat --numstat --summary);
  }
  return 0;
}

sub do_tee {
  my ($st, $w) = @_;
  my $opts = 1;
  for my $tok (@$w[1 .. $#$w]) {
    my ($v, $m) = expand($tok->{parts}, $st, 1);
    if ($opts && $v =~ /^-./) {
      $opts = 0 if $v eq '--';
      next;
    }
    check_path($v, $m, $st, 'writing') unless $v eq '-';
  }
}

# sed -i edits every file operand; without -e or -f the first operand is the script.
sub do_sed {
  my ($st, $w) = @_;
  my ($inplace, $script, @files) = (0, 0);
  my @a = @$w[1 .. $#$w];
  while (@a) {
    my ($v, $m) = expand((shift @a)->{parts}, $st, 1);
    # A word that starts unresolved could be an option, so the operands cannot be told apart.
    return if substr($v, 0, 1) eq "\x01";
    if ($v eq '--') {
      push @files, map { [expand($_->{parts}, $st, 1)] } @a;
      last;
    }
    if ($v =~ /^--/) {
      $inplace = 1 if $v =~ /^--in-place(?:=|$)/;
      $script = 1 if $v =~ /^--(?:expression|file)(?:=|$)/;
      shift @a if $v =~ /^--(?:expression|file|line-length)$/;
      next;
    }
    if ($v =~ /^-(.+)/s) {
      my $flags = $1;
      while (length $flags) {
        my $f = substr($flags, 0, 1, '');
        if ($f eq 'i' || $f eq 'I') {
          $inplace = 1;
          # BSD sed takes the backup suffix as the next word; an empty or dot-led word is that suffix.
          if (!length $flags && @a >= 2) {
            my $next = value($a[0], $st);
            shift @a if $next eq '' || $next =~ /^\./;
          }
          last;
        }
        if ($f eq 'e' || $f eq 'f') {
          $script = 1;
          shift @a unless length $flags;
          last;
        }
        if ($f eq 'l') {
          shift @a unless length $flags;
          last;
        }
      }
      next;
    }
    push @files, [$v, $m];
  }
  return unless $inplace;
  shift @files unless $script;
  check_path(@$_, $st, 'writing') for @files;
}

# cp and mv write their last operand, or the -t folder. mv also takes each source out of its folder, so
# a source inside the checkout is a change too.
sub do_cpmv {
  my ($st, $w, $mv) = @_;
  my ($target, @ops);
  my $opts = 1;
  my @a = @$w[1 .. $#$w];
  while (@a) {
    my ($v, $m) = expand((shift @a)->{parts}, $st, 1);
    if ($opts && $v =~ /^-./) {
      if ($v eq '--') { $opts = 0 }
      elsif ($v =~ /^--target-directory(=?)/) {
        my $n = length "--target-directory$1";
        $target = $1 ? [substr($v, $n), substr($m, $n)] : @a ? [expand((shift @a)->{parts}, $st, 1)] : undef;
      } elsif ($v =~ /^-[^-]*t(.*)/s) {
        my $n = length($v) - length($1);
        $target = length $1 ? [substr($v, $n), substr($m, $n)] : @a ? [expand((shift @a)->{parts}, $st, 1)] : undef;
      } elsif ($v eq '-S' || $v eq '--suffix') {
        shift @a;
      }
      next;
    }
    push @ops, [$v, $m];
  }
  my $dest = $target || pop @ops;
  check_path(@$dest, $st, 'writing') if $dest;
  return unless $mv;
  check_path(@$_, $st, 'moving', 1) for @ops;
}

# touch creates or updates every file operand.
sub do_touch {
  my ($st, $w) = @_;
  my $opts = 1;
  my @a = @$w[1 .. $#$w];
  while (@a) {
    my ($v, $m) = expand((shift @a)->{parts}, $st, 1);
    if ($opts && $v =~ /^-./) {
      if ($v eq '--') { $opts = 0 }
      # -r FILE, -t STAMP, -d DATE and -A ADJUST take the next word, alone or ending a group.
      elsif ($v =~ /^-[A-Za-z]*[rtdA]$/ || $v =~ /^--(?:reference|date|time)$/) { shift @a }
      next;
    }
    check_path($v, $m, $st, 'writing');
  }
}

sub do_rm {
  my ($st, $w) = @_;
  my $opts = 1;
  for my $tok (@$w[1 .. $#$w]) {
    my ($v, $m) = expand($tok->{parts}, $st, 1);
    if ($opts && $v =~ /^-./) {
      $opts = 0 if $v eq '--';
      next;
    }
    check_path($v, $m, $st, 'removing', 1);
  }
}

# bash -c, sh -c, zsh -c: the script string runs in a child shell with the folder and the variables at
# this point plus the prefix assignments. Without -c or a script file, a heredoc or here-string on
# stdin is the script.
sub do_shell {
  my ($st, $n, $w, $env) = @_;
  my ($cflag, $sflag, $i) = (0, 0, 1);
  while ($i < @$w) {
    my $o = value($w->[$i], $st);
    if ($o eq '-') {
      $i++;
      $sflag = 1;
      last;
    }
    last unless $o =~ /^[-+]./;
    $i++;
    last if $o eq '--';
    if ($o =~ /^--/) {
      $i++ if $o eq '--rcfile' || $o eq '--init-file';
      next;
    }
    my $flags = substr($o, 1);
    $cflag = 1 if substr($o, 0, 1) eq '-' && $flags =~ /c/;
    $sflag = 1 if $flags =~ /s/;
    $i++ if $flags =~ /[oO]$/;
  }
  my $script;
  if ($cflag) {
    return if $i >= @$w;
    $script = (expand($w->[$i]{parts}, $st, 0))[0];
  } elsif ($i >= @$w || $sflag) {
    for my $r (@{ $n->{redirs} }) {
      next unless $r->{fd} eq '' || $r->{fd} eq '0';
      if ($r->{hd}) { $script = $r->{hd}{quoted} ? $r->{hd}{body} : (expand($r->{hd}{parts}, $st, 0))[0] }
      elsif ($r->{op} eq '<<<') { $script = (expand($r->{w}{parts}, $st, 0))[0] }
      elsif ($r->{op} =~ /^</) { $script = undef }
    }
  }
  return unless defined $script && length $script;
  my $child = clone_state($st, 1);
  set_var($child, $_, $env->{$_}) for sort keys %$env;
  $child->{depth}++;
  run_script($script, $child);
}

# eval runs its arguments, joined by spaces, in this shell.
sub do_eval {
  my ($st, $w) = @_;
  my @a = @$w[1 .. $#$w];
  shift @a if @a && value($a[0], $st) eq '--';
  my $s = join ' ', map { (expand($_->{parts}, $st, 0))[0] } @a;
  return unless length $s;
  local $st->{depth} = $st->{depth} + 1;
  run_script($s, $st);
}

# export, declare, typeset, local and readonly record NAME=value; an attribute that changes the value
# (array, integer, case, nameref) makes it unknown.
sub do_declare {
  my ($st, $w) = @_;
  my $plain = 1;
  for my $tok (@$w[1 .. $#$w]) {
    if ($tok->{asg}) {
      if ($plain) { assign($st, $tok) }
      else { forget($st, $tok->{asg}[0]) }
      next;
    }
    my $o = value($tok, $st);
    $plain = 0 if $o =~ /^[-+].*[aAilnu]/;
  }
}

# A script string with a syntax error is checked up to the line holding it, as bash runs the lines before.
sub run_script {
  my ($s, $st) = @_;
  return if $st->{depth} > $MAX_DEPTH;
  my $list = eval { parse_script($s, $st->{depth}, 1) } or return;
  run_list($list, $st);
}
