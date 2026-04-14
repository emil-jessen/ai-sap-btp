@path: '/figaf'
@requires: 'any'
service FigafService {
  type ModelView {
    modelKey    : String;
    title       : String;
    description : String;
    endpoint    : String;
    configured  : Boolean;
    count       : Integer;
    status      : String;
    message     : String;
  }

  type FigafRecord {
    id            : String;
    model         : String;
    objectType    : String;
    name          : String;
    technicalName : String;
    externalId    : String;
    modifiedAt    : String;
    deleted       : Boolean;
    raw           : LargeString;
  }

  type FigafAgent {
    id       : String;
    guid     : String;
    systemId : String;
    name     : String;
  }

  type ConnectionStatus {
    configured        : Boolean;
    connectionMode    : String;
    destinationName   : String;
    baseUrl           : String;
    hasClientId       : Boolean;
    hasClientSecret   : Boolean;
    hasDestination    : Boolean;
    hasSessionCookie  : Boolean;
    hasUserToken      : Boolean;
    userTokenScopeCount : Integer;
    hasUaaUserScope   : Boolean;
    hasFigafScopesInUserToken : Boolean;
    figafScopesInUserToken : array of String;
    destinationTokenScopeCount : Integer;
    hasFigafScopesInDestinationToken : Boolean;
    figafScopesInDestinationToken : array of String;
    destinationAuthentication : String;
    destinationError  : String;
    agentSystemId     : String;
    agentId           : String;
    scenarioEndpoint  : String;
    message           : String;
  }

  type ConnectionStep {
    title       : String;
    description : String;
    done        : Boolean;
  }

  type AiFinding {
    severity : String;
    rule     : String;
    field    : String;
    detail   : String;
  }

  type AiAnalysis {
    configured : Boolean;
    model      : String;
    message    : String;
    findings   : array of AiFinding;
  }

  type AiChatResponse {
    configured : Boolean;
    model      : String;
    answer     : String;
  }

  function status() returns ConnectionStatus;
  function connectionGuide() returns array of ConnectionStep;
  function agents() returns array of FigafAgent;
  function modelViews(agentId : String) returns array of ModelView;
  function partners(agentId : String) returns array of FigafRecord;
  function companySubsidiaries(agentId : String) returns array of FigafRecord;
  function scenarios(agentId : String) returns array of FigafRecord;
  action aiConsistencyAnalysis(payload : LargeString) returns AiAnalysis;
  action aiAdviceChat(payload : LargeString) returns AiChatResponse;
}
