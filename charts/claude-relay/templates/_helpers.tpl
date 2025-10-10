{{/*
Expand the name of the chart.
*/}}
{{- define "claude-relay.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "claude-relay.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "claude-relay.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "claude-relay.labels" -}}
helm.sh/chart: {{ include "claude-relay.chart" . }}
{{ include "claude-relay.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "claude-relay.selectorLabels" -}}
app.kubernetes.io/name: {{ include "claude-relay.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "claude-relay.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "claude-relay.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Redis host configuration
*/}}
{{- define "claude-relay.redisHost" -}}
{{- if .Values.redis.enabled }}
{{- printf "%s-redis" (include "claude-relay.fullname" .) }}
{{- else }}
{{- .Values.externalRedis.host }}
{{- end }}
{{- end }}

{{/*
Redis port configuration
*/}}
{{- define "claude-relay.redisPort" -}}
{{- if .Values.redis.enabled }}
{{- "6379" }}
{{- else }}
{{- .Values.externalRedis.port | toString }}
{{- end }}
{{- end }}

{{/*
Redis password configuration
*/}}
{{- define "claude-relay.redisPassword" -}}
{{- if .Values.redis.enabled }}
{{- if .Values.redis.auth.enabled }}
{{- .Values.redis.auth.password }}
{{- else }}
{{- "" }}
{{- end }}
{{- else }}
{{- .Values.externalRedis.password }}
{{- end }}
{{- end }}

{{/*
Redis database configuration
*/}}
{{- define "claude-relay.redisDatabase" -}}
{{- if .Values.redis.enabled }}
{{- "0" }}
{{- else }}
{{- .Values.externalRedis.database | toString }}
{{- end }}
{{- end }}

{{/*
Redis TLS configuration
*/}}
{{- define "claude-relay.redisTLS" -}}
{{- if .Values.redis.enabled }}
{{- "false" }}
{{- else }}
{{- .Values.externalRedis.tls | toString }}
{{- end }}
{{- end }}